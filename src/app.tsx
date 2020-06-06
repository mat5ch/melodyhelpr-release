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
import { MusicRNN } from '@magenta/music/node/music_rnn';
import { INoteSequence } from '@magenta/music/node/protobuf/index';
import NotePlayer from './noteplayer';
import { sequenceProtoToMidi, sequences } from '@magenta/music/node/core';

const homeDir = os.homedir();
const tmpDir = homeDir.concat('/ardour_electron');
const melodyFile = "/melody.mid";

interface MelodyhelprProps {
    title?: string;
}

interface MelodyhelprState {
    qpm: number;
    divisions: number;
    divisor: number;
    bars: number;
    stepsPerBar: number; 
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
    model: MusicRNN | undefined;
    constructor(props: MelodyhelprProps) {
        super(props);
        if (props.title) document.title = props.title;
        this.state = {
            qpm: 120, // -> bpm
            divisions: 4,
            divisor: 4,
            bars: 2,
            stepsPerBar: 16, // => 4 quarters a 4 steps
            chords: 'presets',
            chordProgression: CHORDS,
            noteSequence: {},
            notesCanBePlayed: false,
            temperature: 1.0, // randomness
        };
        this.model = undefined;
        this.openSocket = this.openSocket.bind(this);
        this.generateSequence = this.generateSequence.bind(this);
        this.doubleSequence = this.doubleSequence.bind(this);
        this.halveSequence = this.halveSequence.bind(this);
        this.transferToArdour = this.transferToArdour.bind(this);
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
                        divisions: osc.fromBuffer(msg)["args"][1].value,
                        divisor: osc.fromBuffer(msg)["args"][2].value,
                        chords: 'presets',
                        notesCanBePlayed: false,
                    });
                    // TODO: check if boolean flag (exp_chords) in Ardour has been set
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
        /**
         * create empty note sequence as a starter
         */ 
        // make sure that the sequence has the adequate length
        let stepsPerQuarter = 4;
        let stepsPerBar = this.state.stepsPerBar;
        let totalQuantizedSteps = (this.state.bars * stepsPerBar) * (this.state.divisions/this.state.divisor); 
        if (this.state.divisor === 3) {
            stepsPerQuarter = 3;
            stepsPerBar = this.state.divisions * (4/3) * stepsPerQuarter; // calc from fourths to thirds
            totalQuantizedSteps = stepsPerBar * this.state.bars; 
        }
        const initSeq: INoteSequence = {
            quantizationInfo: {stepsPerQuarter: stepsPerQuarter}, // steps per quarter set to 4 for now
            totalQuantizedSteps: totalQuantizedSteps, // use 32 steps = 2 bars for now
            notes: [],
        }
        
        // create and init magenta model
        this.model = new MusicRNN("https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv");
        const sequence = 
            await this.model
                .initialize()
                .then(() => this.model.continueSequence(
                    initSeq,
                    totalQuantizedSteps,
                    this.state.temperature,
                    this.state.chordProgression.slice(0, 2),
                ));
        
        this.setState({
          noteSequence: sequence,
          notesCanBePlayed: true,
          stepsPerBar: stepsPerBar, 
        });
        // this.model.dispose(); // TODO: check at which point model should be disposed
    }

    async doubleSequence() {
        const outputLength = this.state.bars * this.state.stepsPerBar;

        const continuation = await this.model.continueSequence(
            this.state.noteSequence,
            outputLength,
            this.state.temperature,
            this.state.chordProgression.slice(
            this.state.bars,
            this.state.bars * 2
            )
        );
        const outputSequence = sequences.concatenate([
            this.state.noteSequence,
            continuation
        ]); 
        
        this.setState(prevState => {
            return {
                noteSequence: outputSequence,
                notesCanBePlayed: true,
                bars: prevState.bars * 2, 
            };
        });      
    }

    halveSequence() {
        const halvedSequence = sequences.trim(
            this.state.noteSequence,
            0,
            (this.state.stepsPerBar * this.state.bars) / 2
        );

        this.setState(prevState => {
            return {
              noteSequence: halvedSequence,
              bars: prevState.bars / 2
            };
        });
    }

    transferToArdour() {
        // explicitely set a velocity for all notes in the sequence, otherwise midi file does not contain any notes
        const notes = this.state.noteSequence.notes.map(note => {
            note.velocity = 80;
            return note;
        });
        this.state.noteSequence.notes = notes;
        this.state.noteSequence.timeSignatures.push({time: 0, numerator: this.state.divisions, denominator: this.state.divisor});

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
                            </div>
                            <div className='card-body'>
                                <p id='status-bar'>
                                {`bpm: ${this.state.qpm.toFixed(1)} | time: ${this.state.divisions}/${this.state.divisor} | bars: ${this.state.bars}  
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
                                    <button className='btn btn-outline-secondary' disabled={this.state.bars === 2} onClick={this.halveSequence}>:2</button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.bars === 8} onClick={this.doubleSequence}>x2</button>
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