\## Changes to make



\-add 2 new substrate options to the drop down

&#x09;--BMCP

&#x09;--WMCP



\-if either is selected in addition to "Raw Material" being *unchecked,* make it so that the layup sheet generated for this material is a "stack" of 2 materials instead of 3.

&#x09;--to explain, if the substrate is one of the MCP options (B - black, W - white) this is a 2 sided pre bought board not a laminate sheet

&#x09;--sometimes we lay up sheets of other laminate on one face of this MCP material

&#x09;--therefore the "stack" does not need 3 layers. it should look like the following example:

&#x09;	Designer White

&#x09;-------------------------------

&#x09;	BMCP



&#x09;--the textboxes for face up and face down will be filled out by the user just the same as now however the user's input is just to determine which face is up their laminate or the MCP face.

&#x09;--not sure how best to handle this with regards to how the user inputs the laminate on MCP with an MCP substrate choice but the wizard does not double interpret this 

