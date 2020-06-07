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
import ChordView from './chordview';

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
    loading: boolean;
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
            loading: false,
            temperature: 1.0, // randomness
        };
        this.model = undefined;
        this.openSocket = this.openSocket.bind(this);
        this.generateSequence = this.generateSequence.bind(this);
        this.changeTemp = this.changeTemp.bind(this);
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
                    });
                    // TODO: check if boolean flag (exp_chords) in Ardour has been set
                    if (osc.fromBuffer(msg)['args'][3].value === true) {   
                    }
                    // do not automatically create a new sequence when script in Ardour is run 
                    // this.generateSequence();  
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
        this.setState({
            loading: true
        });
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
          loading: false,
        });
        // this.model.dispose(); // TODO: check at which point model should be disposed
    }

    changeTemp(event: React.ChangeEvent<HTMLInputElement>) {
        this.setState({
            temperature: Number.parseFloat(event.target.value)
        });
    }

    async doubleSequence() {
        this.setState({
            loading: true
        });
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
                bars: prevState.bars * 2, 
                loading: false,
            };
        });      
    }

    halveSequence() {
        this.setState({
            loading: true
        });

        const halvedSequence = sequences.trim(
            this.state.noteSequence,
            0,
            (this.state.stepsPerBar * this.state.bars) / 2
        );

        this.setState(prevState => {
            return {
              noteSequence: halvedSequence,
              bars: prevState.bars / 2,
              loading: false,
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
                                <div id='status-bar' className='d-flex justify-content-center'>
                                    <p>
                                    {`bpm: ${this.state.qpm.toFixed(1)} | time: ${this.state.divisions}/${this.state.divisor} | bars: ${this.state.bars}  
                                    | randomness: `}
                                    </p>
                                    <input id='temp-input' type='number' step={0.1} min={0.5} max={2.0} value={this.state.temperature.toFixed(1)} onChange={this.changeTemp}></input>
                                </div>
                                <div id='note-player'>
                                <NotePlayer
                                    play={this.state.notesCanBePlayed}
                                    noteSequence={this.state.noteSequence}
                                >
                                </NotePlayer>    
                                </div>
                                <div id='chord-list'>
                                <ChordView chords={this.state.chordProgression.slice(0, this.state.bars)}></ChordView>
                                </div>
                            </div>
                            <div id='button-area' className='card-footer d-flex justify-content-between'>
                                <div className='footer-left d-flex'>
                                    <button className='btn btn-outline-secondary' onClick={this.generateSequence} disabled={this.state.loading}>
                                        <svg id='lightning-icon' className='bi bi-lightning-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                            <path fillRule='evenodd' d='M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z'/>
                                        </svg>
                                    </button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || this.state.bars === 2} onClick={this.halveSequence}>:2</button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || !this.state.notesCanBePlayed || this.state.bars === 8} onClick={this.doubleSequence}>x2</button>
                                </div>
                                <div className='footer-right d-flex'>
                                    <button className='btn btn-outline-secondary' onClick={this.transferToArdour} disabled={this.state.loading}>Transfer</button> 
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