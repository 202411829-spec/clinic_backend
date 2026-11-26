---
description: Disable project-local Playwright MCP (sets playwright.disabled to true)
---

Disable Playwright MCP for this project by changing only `mcp.servers.playwright.disabled` to `true` in `.opencode/opencode.jsonc`.

Rules:
- Modify only the Playwright `disabled` setting.
- Preserve Context7, the Playwright command/capabilities/safety flags, and all other configuration.
- Do not modify global config or application code.

Run this exact PowerShell command from `C:\Users\LENOVO\Desktop\clinic_backend`:

```powershell
$p='C:\Users\LENOVO\Desktop\clinic_backend\.opencode\opencode.jsonc'; $c=[System.IO.File]::ReadAllText($p); $n=[regex]::Replace($c,'("playwright"\s*:\s*\{[\s\S]*?"disabled"\s*:\s*)false','$1true'); if($n -ne $c){[System.IO.File]::WriteAllText($p,$n,[System.Text.UTF8Encoding]::new($false)); 'playwright: disabled'} elseif($c -match '"playwright"\s*:\s*\{[\s\S]*?"disabled"\s*:\s*true'){ 'playwright: already disabled'} else { 'playwright: setting not found' }
```

After changing config, remind the user to reload/restart the OpenCode session if the MCP status does not update.
