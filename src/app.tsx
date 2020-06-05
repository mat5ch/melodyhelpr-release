/* CSS imports */
import './styles/index.css';
import './styles/bootstrap.min.css';
/* JS libs imports */
import React from 'react';
import ReactDOM from 'react-dom';
import fs from 'fs';
import os from 'os';
import udp from 'dgram';
import osc from 'osc-min';
import { MusicVAE } from '@magenta/music/node/music_vae';
import { NoteSequence, INoteSequence } from '@magenta/music/node/protobuf/index';
import NotePlayer from './noteplayer';
import { sequenceProtoToMidi } from '@magenta/music/node/core';

const homeDir = os.homedir();
const tmpDir = homeDir.concat('/ardour_electron');
const melodyFile = "/melody.mid";

interface MelodyhelprProps {
    title?: string;
}

interface MelodyhelprState {
    qpm: number;
    bars: number;
    chords: string;
    chordProgression: string[];
    noteSequence: INoteSequence;
    notesCanBePlayed: boolean;
    temperature: number;
}

const PORT = 7890;
const HOME_DIR = os.homedir();
const TEMP_DIR = HOME_DIR.concat('/ardour_electron');
const CONN_FILE = '/connected.txt';
// standard chord progression
const CHORDS = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'];

class Melodyhelpr extends React.Component<MelodyhelprProps, MelodyhelprState> {
    constructor(props: MelodyhelprProps) {
        super(props);
        if (props.title) document.title = props.title;
        this.state = {
            qpm: 120, // -> bpm
            bars: 2,
            chords: 'presets',
            chordProgression: CHORDS,
            noteSequence: {},
            notesCanBePlayed: false,
            temperature: 0.7, // randomness
        };
        this.openSocket = this.openSocket.bind(this);
        this.transferToArdour = this.transferToArdour.bind(this);
        this.generateSequence = this.generateSequence.bind(this);
    }

    componentDidMount() {
        this.openSocket();
    }

    openSocket() {
        const SOCK = udp.createSocket('udp4', (msg, rinfo) => {
            try {
                // handle messages sent from Ardour (destructering of incoming msgs)
                if (osc.fromBuffer(msg)['address'] === 'SEQ_INFO') {
                    this.setState({
                        qpm: osc.fromBuffer(msg)['args'][0].value,  
                        chords: 'presets',
                        notesCanBePlayed: false,
                    });
                    // check if boolean flag (exp_chords) in Ardour has been set
                    if (osc.fromBuffer(msg)['args'][3].value === true) {  
                        
                    }
                    this.generateSequence();
                }
                // establish connection with Ardour (basic fs check for now)
                if (osc.fromBuffer(msg)['address'] === 'CONNECT') {
                    fs.writeFile(TEMP_DIR.concat(CONN_FILE), 'connect', 'utf8', err => {
                        if (err) throw err;
                        console.log('The file has been written!');
                    });
                }
                return console.log(osc.fromBuffer(msg));
            } catch (error) {
                return console.log('Error: ', error);
            }
        });
        SOCK.bind(PORT);
    }

    async generateSequence() {
        // create and init magenta model
        const musicVAE = new MusicVAE(
          "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_chords"
        );
        await musicVAE.initialize();
        /* note:
         * the length of the sequence depends on the checkpoint + config file passed to the constructor of the model,
         * steps per quarter set to 4 (for now!)
         */
        const sample = await musicVAE.sample(
          1, // sample amount
          this.state.temperature, 
          this.state.chordProgression.slice(0, 2),
          4, // steps per quarter
          this.state.qpm
        );
        // grab first element of returned inotesequence array
        let sequence = sample[0];
        // make sure that notes are in range (48 - 83) for the improvRNN model (see doubleSequence function (TODO))
        if (sequence.notes) {
            const notes: NoteSequence.INote[] = sequence.notes.map(noteObj => {
                if (noteObj.pitch) {
                    if (noteObj.pitch < 48) {
                        // Math.ceil = return next larger integer no
                        noteObj.pitch += Math.ceil((48 - noteObj.pitch) / 12) * 12;
                    } else if (noteObj.pitch > 83) {
                        noteObj.pitch -= Math.ceil((noteObj.pitch - 83) / 12) * 12;
                    }
                }
                return noteObj;
            });
            sequence.notes = notes;
        }
        sequence.tempos[0].time = 0; // TODO: check why this time info is not set automatically!
        
        this.setState({
          noteSequence: sequence,
          notesCanBePlayed: true,
        });
        musicVAE.dispose();
    }

    transferToArdour() {
        // explicitely set a velocity for all notes in the sequence, otherwise midi file does not contain any notes
        const notes = this.state.noteSequence.notes.map(note => {
            note.velocity = 80;
            return note;
        });
        this.state.noteSequence.notes = notes;
        
        const midi = sequenceProtoToMidi(this.state.noteSequence);
        fs.writeFileSync(tmpDir.concat(melodyFile), midi);
    }

    render() {
        return (
            <div className='container'>
                <div className='row'>
                    <div className='col'>
                        <h1 id='main-title' className='text-center'>Melody Helpr</h1>
                    </div>
                </div>
                <div className='row'>
                    <div className='col'>
                        <div className='card text-center'>
                            <div className='card-title'>
                                <p id='user-info'>Waiting for Ardour to connect.</p>
                    </div>
                            <div className='card-body'>
                                <p id='status-bar'>
                                {`bpm: ${this.state.qpm.toFixed(1)} | time: 4/4 | bars: ${this.state.bars}  
                                | randomness: ${this.state.temperature}`}
                        </p>
                                <div id='note-player'>
                                <NotePlayer
                                    play={this.state.notesCanBePlayed}
                                    noteSequence={this.state.noteSequence}
                                >
                                </NotePlayer>    
                                </div>
                                <div id='chord-list'>

                                </div>
                            </div>
                            <div className='card-footer d-flex'>
                                <div className='footer-left'>
                                    <button className='btn btn-outline-secondary' onClick={this.transferToArdour}>Transfer</button>
                                </div>
                                <div className='footer-right d-flex'>
                                    <button className='btn btn-outline-secondary'>:2</button>
                                    <button className='btn btn-outline-secondary'>x2</button>
                                    <button className='btn btn-outline-secondary'>
                                        <svg className='bi bi-shuffle' width='1em' height='1em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                          <path fillRule='evenodd' d='M12.646 1.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 4l-2.147-2.146a.5.5 0 0 1 0-.708zm0 8a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 12l-2.147-2.146a.5.5 0 0 1 0-.708z' />
                                          <path fillRule='evenodd' d='M0 4a.5.5 0 0 1 .5-.5h2c3.053 0 4.564 2.258 5.856 4.226l.08.123c.636.97 1.224 1.865 1.932 2.539.718.682 1.538 1.112 2.632 1.112h2a.5.5 0 0 1 0 1h-2c-1.406 0-2.461-.57-3.321-1.388-.795-.755-1.441-1.742-2.055-2.679l-.105-.159C6.186 6.242 4.947 4.5 2.5 4.5h-2A.5.5 0 0 1 0 4z' />
                                          <path fillRule='evenodd' d='M0 12a.5.5 0 0 0 .5.5h2c3.053 0 4.564-2.258 5.856-4.226l.08-.123c.636-.97 1.224-1.865 1.932-2.539C11.086 4.93 11.906 4.5 13 4.5h2a.5.5 0 0 0 0-1h-2c-1.406 0-2.461.57-3.321 1.388-.795.755-1.441 1.742-2.055 2.679l-.105.159C6.186 9.758 4.947 11.5 2.5 11.5h-2a.5.5 0 0 0-.5.5z' />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

ReactDOM.render(<Melodyhelpr title="Melody Helpr" />, document.getElementById("my-app"));