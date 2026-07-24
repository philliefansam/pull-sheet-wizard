# PowerShell HTTP Listener Server for Pull Sheet Wizard
# Port 9999

$ErrorActionPreference = "Stop"

# 1. Download sql-wasm.js and sql-wasm.wasm if they are missing
$publicDir = Join-Path $PSScriptRoot "public"
if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}

$jsPath = Join-Path $publicDir "sql-wasm.js"
$wasmPath = Join-Path $publicDir "sql-wasm.wasm"

$jsUrl = "https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.js"
$wasmUrl = "https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.wasm"

if (-not (Test-Path $jsPath)) {
    Write-Host "Downloading sql-wasm.js..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $jsUrl -OutFile $jsPath -UseBasicParsing
}
if (-not (Test-Path $wasmPath)) {
    Write-Host "Downloading sql-wasm.wasm..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $wasmUrl -OutFile $wasmPath -UseBasicParsing
}

# 2. Setup HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:9989/")

try {
    $listener.Start()
    Write-Host "Server running at http://localhost:9989/" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
} catch {
    Write-Host "Failed to start HTTP listener: $_" -ForegroundColor Red
    Exit 1
}

# Cleanup helper on exit
function Stop-Server {
    if ($listener.IsListening) {
        $listener.Stop()
        $listener.Close()
        Write-Host "Server stopped." -ForegroundColor Red
    }
}

# Helper to send JSON responses
function Send-Json ($context, $statusCode, $dataObject) {
    $response = $context.Response
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    $json = ConvertTo-Json $dataObject -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# Helper to serve static files
function Serve-File ($context, $filePath) {
    $response = $context.Response
    if (-not (Test-Path $filePath)) {
        Send-Json $context 404 @{ message = "File not found" }
        return
    }
    
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    switch ($ext) {
        ".html" { $response.ContentType = "text/html" }
        ".css"  { $response.ContentType = "text/css" }
        ".js"   { $response.ContentType = "application/javascript" }
        ".wasm" { $response.ContentType = "application/wasm" }
        ".png"  { $response.ContentType = "image/png" }
        ".ico"  { $response.ContentType = "image/x-icon" }
        default { $response.ContentType = "application/octet-stream" }
    }
    
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    try {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}

# Helper to read request body safely with logging and StreamReader fallback
function Get-RequestBody ($req) {
    Write-Host "[DEBUG] Get-RequestBody called. HasEntityBody=$($req.HasEntityBody)" -ForegroundColor Gray
    if (-not $req.HasEntityBody) { return "" }
    
    $len = $req.ContentLength64
    Write-Host "[DEBUG] ContentLength64=$len" -ForegroundColor Gray
    
    # If content length is not set (-1) or 0, use StreamReader
    if ($len -le 0) {
        Write-Host "[DEBUG] ContentLength <= 0. Using StreamReader..." -ForegroundColor Gray
        $stream = $req.InputStream
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        Write-Host "[DEBUG] Read body of length: $($body.Length)" -ForegroundColor Gray
        return $body
    }
    
    Write-Host "[DEBUG] Allocating buffer of size: $len" -ForegroundColor Gray
    $buffer = New-Object byte[] $len
    $totalRead = 0
    while ($totalRead -lt $len) {
        $toRead = $len - $totalRead
        Write-Host "[DEBUG] Reading stream: offset=$totalRead, count=$toRead" -ForegroundColor Gray
        $read = $req.InputStream.Read($buffer, $totalRead, $toRead)
        Write-Host "[DEBUG] Read result: $read" -ForegroundColor Gray
        if ($read -le 0) { break }
        $totalRead += $read
    }
    
    $body = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $totalRead)
    Write-Host "[DEBUG] Read body of length: $($body.Length)" -ForegroundColor Gray
    return $body
}

# 3. Main Request Loop
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.Url.LocalPath
        $method = $request.HttpMethod
        
        Write-Host "[REQUEST] $method $urlPath" -ForegroundColor Cyan
        
        # Handle CORS OPTIONS request
        if ($method -eq "OPTIONS") {
            Write-Host "[DEBUG] Handling OPTIONS CORS preflight" -ForegroundColor Gray
            $response.StatusCode = 200
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.OutputStream.Close()
            continue
        }
        
        # Routing Logic
        if ($method -eq "GET" -and ($urlPath -eq "/" -or $urlPath -eq "/index.html")) {
            Write-Host "[DEBUG] Serving index.html" -ForegroundColor Gray
            Serve-File $context (Join-Path $publicDir "index.html")
        } 
        elseif ($method -eq "GET" -and $urlPath -eq "/api/status") {
            Write-Host "[DEBUG] Serving status API" -ForegroundColor Gray
            Send-Json $context 200 @{ 
                status = "ok"
                username = $env:USERNAME
                timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") 
            }
        }
        elseif ($method -eq "GET") {
            # Try to serve file from public folder as fallback
            $fileName = $urlPath.TrimStart('/')
            if ($fileName.StartsWith("public/")) {
                $fileName = $fileName.Substring(7)
            }
            $filePath = Join-Path $publicDir $fileName
            if (Test-Path $filePath -PathType Leaf) {
                Write-Host "[DEBUG] Serving static file: $fileName" -ForegroundColor Gray
                Serve-File $context $filePath
            } else {
                Write-Host "[DEBUG] Static file not found: $fileName" -ForegroundColor Red
                Send-Json $context 404 @{ message = "File not found" }
            }
        }
        elseif ($method -eq "POST" -and $urlPath -eq "/api/scan") {
            Write-Host "[DEBUG] Handling scan request..." -ForegroundColor Gray
            # Read JSON body safely
            $body = Get-RequestBody $request
            Write-Host "[DEBUG] Parsing scan request JSON..." -ForegroundColor Gray
            $inputData = ConvertFrom-Json $body
            $targetPath = $inputData.path
            Write-Host "[DEBUG] Scan target path: $targetPath" -ForegroundColor Gray
            
            if (-not (Test-Path $targetPath)) {
                Write-Host "[DEBUG] Path does not exist: $targetPath" -ForegroundColor Red
                Send-Json $context 400 @{ message = "Target directory does not exist: $targetPath" }
                continue
            }
            
            # Scan directory for relevant files
            Write-Host "[DEBUG] Finding files..." -ForegroundColor Gray
            $files = Get-ChildItem -Path $targetPath -Recurse -File | Where-Object {
                $_.Extension -match "^\.(mpr|hop|cpout|cpl|txt|pull)$" -or $_.Name -match "cpout"
            }
            Write-Host "[DEBUG] Found $($files.Count) matching files." -ForegroundColor Gray
            
            $fileList = @()
            foreach ($file in $files) {
                # Relative path from target folder
                $relative = $file.FullName.Substring($targetPath.TrimEnd('\').Length + 1).Replace('\', '/')
                Write-Host "[DEBUG] Reading file: $relative" -ForegroundColor Gray
                $content = [string](Get-Content -Path $file.FullName -Raw)
                
                $fileList += @{
                    name = $file.Name
                    relativePath = $relative
                    content = $content
                }
            }
            
            Write-Host "[DEBUG] Sending scan results..." -ForegroundColor Gray
            Send-Json $context 200 @{ 
                files = $fileList
                username = $env:USERNAME
            }
            Write-Host "[DEBUG] Scan response sent successfully." -ForegroundColor Gray
        }
        elseif ($method -eq "POST" -and $urlPath -eq "/api/save-database") {
            Write-Host "[DEBUG] Handling save-database request..." -ForegroundColor Gray
            $body = Get-RequestBody $request
            $inputData = ConvertFrom-Json $body
            $targetPath = $inputData.targetPath
            $dbBase64 = $inputData.dbBase64
            
            if (-not (Test-Path $targetPath)) {
                Send-Json $context 400 @{ message = "Target directory does not exist: $targetPath" }
                continue
            }
            
            $dbPath = Join-Path $targetPath "project_data.db"
            Write-Host "[DEBUG] Writing database to: $dbPath" -ForegroundColor Gray
            
            # Convert Base64 back to byte array
            $dbBytes = [System.Convert]::FromBase64String($dbBase64)
            
            # Write to file
            [System.IO.File]::WriteAllBytes($dbPath, $dbBytes)
            
            Write-Host "SQLite Database successfully saved to: $dbPath" -ForegroundColor Green
            Send-Json $context 200 @{ message = "Database successfully written to: $dbPath" }
        }
        elseif ($method -eq "POST" -and $urlPath -eq "/api/generate-demo") {
            $demoPath = Join-Path $PSScriptRoot "demo-project"
            
            # Create subfolders for materials
            $mat1Dir = Join-Path $demoPath "3-4 2S Natural Recon"
            $mat2Dir = Join-Path $demoPath "1-1-8 2S PB Core"
            
            New-Item -ItemType Directory -Path $mat1Dir -Force | Out-Null
            New-Item -ItemType Directory -Path $mat2Dir -Force | Out-Null
            
            # Write demo files
            # 1. Pull sheet 1
            $pull1 = @"
Spray Booth --> then Homag
(2) WA NATURAL RECON/7996-38
    PB                             3/4" (46"x79")
    BKR

Homag
(4) 3/4" Plywood (5x10)
"@
            [System.IO.File]::WriteAllText((Join-Path $mat1Dir "pull_sheet.txt"), $pull1, [System.Text.Encoding]::UTF8)
            
            # 2. MPR file
            $mpr = @"
[001
l="2440.0"
w="1220.0"
h="19.0"
]2
KL X="100.0" Y="100.0"
KL X="2340.0" Y="1120.0"
"@
            [System.IO.File]::WriteAllText((Join-Path $mat1Dir "nested_cabinet_parts.mpr"), $mpr, [System.Text.Encoding]::UTF8)
            
            # 3. Pull sheet 2
            $pull2 = @"
Spray Booth --> then Beam Saw
(1) OAK VENEER PREMIUM
    PB                             1-1/8" (5x10)
    BKR
"@
            [System.IO.File]::WriteAllText((Join-Path $mat2Dir "layup_instructions.txt"), $pull2, [System.Text.Encoding]::UTF8)
            
            # 4. HOP file
            $hop = @"
VARS
DX := 120.0
DY := 60.0
START
SP(10.0, 10.0)
G01(110.0, 50.0)
"@
            [System.IO.File]::WriteAllText((Join-Path $mat2Dir "closet_shelves.hop"), $hop, [System.Text.Encoding]::UTF8)
            
            # 5. CPOUT file
            $cpout = @"
INV1,1,2,3,60.0,120.0
ORD1,1,2,96.0,24.0
ORD1,1,2,80.0,18.0
"@
            [System.IO.File]::WriteAllText((Join-Path $mat2Dir "shelf_run.cpout"), $cpout, [System.Text.Encoding]::UTF8)
            
            Send-Json $context 200 @{ demoPath = $demoPath }
        }
        else {
            Send-Json $context 404 @{ message = "Endpoint not found" }
        }
        
    } catch {
        Write-Host "Error serving request: $_" -ForegroundColor Red
        if ($context) {
            $context.Response.StatusCode = 500
            $context.Response.OutputStream.Close()
        }
    }
}

# Stop server on script end
Stop-Server
