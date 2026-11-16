!macro customInstall
  ; Tell Windows to refresh cached icons so the taskbar/Start/desktop show the new Droply icon
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
