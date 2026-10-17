; Extra registry entries so Windows lists MD Viewer in "Default apps" and "Open with".
; electron-builder already writes the MDViewer.Markdown ProgID and OpenWithProgids.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities" "ApplicationName" "MD Viewer"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities" "ApplicationDescription" "A beautiful tabbed Markdown viewer"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities" "ApplicationIcon" "$INSTDIR\MD Viewer.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities\FileAssociations" ".md" "MDViewer.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities\FileAssociations" ".markdown" "MDViewer.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities\FileAssociations" ".mdown" "MDViewer.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\MD Viewer\Capabilities\FileAssociations" ".mkd" "MDViewer.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "MD Viewer" "Software\MD Viewer\Capabilities"

  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe" "FriendlyAppName" "MD Viewer"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\DefaultIcon" "" "$INSTDIR\resources\file.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\shell\open\command" "" '"$INSTDIR\MD Viewer.exe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\SupportedTypes" ".md" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\SupportedTypes" ".markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\SupportedTypes" ".mdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe\SupportedTypes" ".mkd" ""

  ; tell Explorer the associations changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "MD Viewer"
  DeleteRegKey SHELL_CONTEXT "Software\MD Viewer"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\MD Viewer.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
