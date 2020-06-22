# melodyhelpr-release
Creating Melodies with the help of ML (Google Magenta.js)

Clone the repo.
```bash
https://github.com/mat5ch/melodyhelpr-release.git
```

Install the dependencies.
```bash
npm install
```

Run the app.
```
npm start
```

To connect to Ardour, do the following steps:
- Copy the two LUA scripts into the scripts folder in the Ardour application directory (check version of 'create_melody')
  - Linux: /opt/Ardour.../share/scripts
  - MacOS: /Applications/Ardour5/Contents/Resources/scripts)
- Register the scripts in an Ardour session:
  - Open up Ardour, goto Menu “Edit”, then select “Lua Scripts“ —> “Script Manager”    
  - Click on tab Action Hooks, New Hook and then select “Check if file exists” script
  - Hit the tab Action Scripts, click on Add/Set and select the script “Create Melody”
  - Close the Script Manager
- Run 'Create melody' script (under Edit -> Lua Scripts). You can also bind this action to a keyboard shortcut.
