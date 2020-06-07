import { app, BrowserWindow } from 'electron';
declare const MAIN_WINDOW_WEBPACK_ENTRY: any;

// imports
import fs from 'fs';
import os from 'os';
// usr vars
const HOME_DIR = os.homedir();
const TEMP_DIR = HOME_DIR.concat('/ardour_electron');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createDir = () => {
  // Creates a temp folder, used to communicate with Ardour
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (err) {
    console.log('error code: ', err.code);
    if (err.code === 'EEXIST') {
      console.error('Directory already exists');
    }
  }
}

const removeDir = () => {
  // Remove temp folder, but first delete files in folder
  if (fs.existsSync(TEMP_DIR)) {
    fs.readdirSync(TEMP_DIR).forEach((file) => {
      const curPath = TEMP_DIR.concat('/', file);
      fs.unlinkSync(curPath);
    });
    fs.rmdirSync(TEMP_DIR);
  }
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    minHeight: 600,
    minWidth: 800,
    webPreferences: {
      nodeIntegration: true
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // create tmp folder -> acts as an exchange folder between this app and Ardour
  createDir();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // remove tmp folder
  removeDir();
  app.quit();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
