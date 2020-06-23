# melodyhelpr-release
Creating Melodies with the help of ML (Google Magenta.js)

## Node specific

Clone the repo.
```bash
https://github.com/mat5ch/melodyhelpr-release.git
```

Go into directory.
Install the dependencies.
```bash
cd melodyhelpr-release
```

Install the dependencies.
```bash
npm install
```

Run the app.
```bash
npm start
```

## Installation and usage

To connect to Ardour, do the following steps:
- Download and copy the two LUA scripts into the scripts folder in the Ardour application directory
  - Linux: /opt/Ardour.../share/scripts
  - MacOS: /Applications/Ardour5/Contents/Resources/scripts)
- Register the scripts in your Ardour session:
  - Open up Ardour, goto Menu “Edit”, then select “Lua Scripts“ —> “Script Manager”    
  - Click on tab Action Hooks, New Hook and then select “Check if file exists” script
  - Hit the tab Action Scripts, click on Add/Set and select the script “Create Melody”
  - Close the Script Manager

- Run the executable of the downloaded app
  - Linux: Open up a terminal, change into downloaded directory and run `./melodyhelpr-release`
- Open up Ardour 
  - Run 'Create melody' script (under Edit -> Lua Scripts) in Ardour to transfer transport information to Melody Helpr (bpm, time signature). If you have selected a midi region before running the script, this info is transferred. The new created melodies will be mapped to a scale the chords fit in.
- Create new melodies by hitting the most left button. Change randomness value to increase the amount of notes and the overall range
- When happy with a melody, transfer the sequence over to Ardour

## Video

Coming soon.