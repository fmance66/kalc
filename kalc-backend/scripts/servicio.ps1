# Mantiene levantada la API de kalc-backend en un servidor Windows (ver "Despliegue" en el README).
# Se corre EN EL SERVIDOR, en PowerShell como administrador, desde la carpeta publicada (por
# ejemplo C:\app\kalc-backend).
#
# El servidor corre como una tarea programada de SYSTEM que arranca con Windows y se reinicia si
# se cae: no hace falta instalar nada (NSSM, etc.). La salida va a logs\servidor.log.
#
#   .\scripts\servicio.ps1 -Accion instalar     registra la tarea, abre el puerto en el firewall y la arranca
#   .\scripts\servicio.ps1 -Accion reiniciar    después de publicar una versión nueva
#   .\scripts\servicio.ps1 -Accion detener
#   .\scripts\servicio.ps1 -Accion estado       estado de la tarea y últimas líneas del log
#   .\scripts\servicio.ps1 -Accion desinstalar  borra la tarea y la regla del firewall
#   .\scripts\servicio.ps1 -Accion iis          verifica que el IIS pueda reenviar /kalc/api/ acá (URL Rewrite
#                                               y ARR, con el proxy habilitado). El web.config que reenvía va
#                                               con el build de kalc-frontend (su public/web.config)
#
# Compatible con PowerShell 4 (Windows Server 2012 R2).

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('instalar', 'reiniciar', 'detener', 'estado', 'desinstalar', 'iis')]
    [string]$Accion,
    # tiene que coincidir con PUERTO del .env
    [int]$Puerto = 8082,
    # sitio y carpeta del IIS para -Accion iis (la de kalc-frontend)
    [string]$Sitio = 'Default Web Site',
    [string]$CarpetaIis = 'kalc'
)

$ErrorActionPreference = 'Stop'
$Tarea = 'KalcBackend'
$Carpeta = Split-Path -Parent $PSScriptRoot
$Programa = Join-Path $Carpeta 'servidor\index.js'
$Log = Join-Path $Carpeta 'logs\servidor.log'

function Detener {
    if (Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $Tarea
    }
    # la tarea corre cmd, que corre node: parar la tarea no siempre termina a node. Se busca por la
    # ruta completa: en el servidor puede haber otros node
    Get-CimInstance Win32_Process -Filter "name='node.exe'" |
        Where-Object { $_.CommandLine -like "*$Programa*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    # hasta que la tarea no termina, Start-ScheduledTask no hace nada y el servidor queda abajo
    for ($i = 0; $i -lt 30; $i++) {
        $tarea = Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
        if (-not $tarea -or $tarea.State -ne 'Running') { break }
        Start-Sleep -Seconds 1
    }
}

function Estado {
    Get-ScheduledTask -TaskName $Tarea | Select-Object TaskName, State | Format-Table -AutoSize
    Test-NetConnection localhost -Port $Puerto -WarningAction SilentlyContinue |
        Select-Object @{ n = 'Puerto'; e = { $Puerto } }, TcpTestSucceeded | Format-Table -AutoSize
    # node escribe en UTF-8; PowerShell 4 lee como ANSI si no se le indica
    if (Test-Path $Log) { Get-Content $Log -Tail 15 -Encoding UTF8 }
}

switch ($Accion) {
    'instalar' {
        $node = (Get-Command node.exe).Definition
        if (-not (Test-Path (Join-Path $Carpeta '.env'))) {
            throw "Falta $Carpeta\.env con la conexión a la base (ver ""Despliegue"" en el README)."
        }
        New-Item -ItemType Directory -Force (Join-Path $Carpeta 'logs') | Out-Null

        # Si node termina (se cae, o alguien lo mata), cmd lo vuelve a arrancar al minuto: el
        # reintento de la tarea solo vale cuando la tarea no llega a arrancar, no cuando el programa
        # termina después, y el servidor quedaba abajo hasta reiniciarlo a mano. ping y no timeout:
        # sin consola, timeout falla en el acto y el ciclo no esperaría.
        $comando = "/c `"for /l %i in () do (`"$node`" `"$Programa`" >> logs\servidor.log 2>&1 & ping -n 61 127.0.0.1 >nul)`""
        $accionTarea = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $comando -WorkingDirectory $Carpeta
        $disparador = New-ScheduledTaskTrigger -AtStartup
        # sin límite de tiempo, y si no llega a arrancar se reintenta cada minuto
        $opciones = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
        $cuenta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask -TaskName $Tarea -Action $accionTarea -Trigger $disparador `
            -Settings $opciones -Principal $cuenta -Force | Out-Null

        if (-not (Get-NetFirewallRule -DisplayName $Tarea -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $Tarea -Direction Inbound -Protocol TCP `
                -LocalPort $Puerto -Action Allow | Out-Null
        }

        Detener
        Start-ScheduledTask -TaskName $Tarea
        Start-Sleep -Seconds 8
        Estado
    }
    'reiniciar' {
        Detener
        Start-ScheduledTask -TaskName $Tarea
        Start-Sleep -Seconds 8
        Estado
    }
    'iis' {
        Import-Module WebAdministration
        $modulos = (Get-WebGlobalModule).Name
        $faltan = @('RewriteModule', 'ApplicationRequestRouting') | Where-Object { $modulos -notcontains $_ }
        if ($faltan) {
            throw "Faltan módulos del IIS: $($faltan -join ', '). Instalar URL Rewrite 2.1 y Application Request Routing 3.0 (x64) y repetir."
        }
        # ARR viene con el proxy apagado: sin esto la regla responde 404
        & "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:True /commit:apphost | Out-Null

        $destino = Join-Path ([Environment]::ExpandEnvironmentVariables((Get-Item "IIS:\Sites\$Sitio").physicalPath)) $CarpetaIis
        if (-not (Test-Path (Join-Path $destino 'web.config'))) {
            throw "Falta $destino\web.config: publicar antes kalc-frontend (en kalc-frontend, npm run publicar)."
        }
        $url = "http://localhost/$CarpetaIis/api/variables"
        $respuesta = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 15
        "El IIS reenvía a la API. $url -> $($respuesta.StatusCode)"
    }
    'detener' { Detener; Estado }
    'estado' { Estado }
    'desinstalar' {
        Detener
        Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
        Remove-NetFirewallRule -DisplayName $Tarea -ErrorAction SilentlyContinue
        'Tarea y regla del firewall borradas. Los archivos quedan en ' + $Carpeta
    }
}
