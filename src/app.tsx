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
import { INoteSequence, NoteSequence } from '@magenta/music/node/protobuf/index';
import { midiToSequenceProto, sequenceProtoToMidi, sequences, constants } from '@magenta/music/node/core';
import { Chord, Note } from '@tonaljs/tonal';
import NotePlayer from './noteplayer';
import NoteVisualizer from './notevisualizer';
import ChordView from './chordview';

const PORT = 7890;
const HOME_DIR = os.homedir();
const TEMP_DIR = HOME_DIR.concat('/ardour_electron');
const CONN_FILE = '/connected.txt';
const MELODY_FILE = '/melody.mid';
const CHORDS_FILE_ARDOUR = "/chords.mid";
// standard chord progression
const CHORDS = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'];
// values according to min/max pitches accepted by improvRNN model
const MIN_NOTE_PITCH = 48;
const MAX_NOTE_PITCH = 83;

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
    currentNote: NoteSequence.INote;
    noteSequence: INoteSequence;
    loading: boolean;
    playerIsActive: boolean;
    temperature: number;
}

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
            currentNote: {},
            noteSequence: {},
            loading: false,
            playerIsActive: false,
            temperature: 1.0, // randomness
        };
        this.model = undefined;
        this.openSocket = this.openSocket.bind(this);
        this.initSequence = this.initSequence.bind(this);
        this.importChords = this.importChords.bind(this);
        this.generateSequence = this.generateSequence.bind(this);
        this.changeTemp = this.changeTemp.bind(this);
        this.doubleSequence = this.doubleSequence.bind(this);
        this.halveSequence = this.halveSequence.bind(this);
        this.transferToArdour = this.transferToArdour.bind(this);
        this.receiveCurrentNote = this.receiveCurrentNote.bind(this);
        this.receivePlaybackStatus = this.receivePlaybackStatus.bind(this);
    }
    
    componentDidMount() {
        this.openSocket();
    }
    
    openSocket() {
        const SOCK = udp.createSocket('udp4', (msg, rinfo) => {
            try {
                // handle messages sent from Ardour (destructering of incoming msgs)
                if (osc.fromBuffer(msg)['address'] === 'SEQ_INFO') {
                    const divisions = osc.fromBuffer(msg)["args"][1].value;
                    this.setState({
                        qpm: osc.fromBuffer(msg)['args'][0].value,  
                        divisions: divisions,
                        divisor: osc.fromBuffer(msg)["args"][2].value,
                        chords: 'presets',
                        stepsPerBar: divisions * 4, // calc stepsPerBar according to divisions
                    });
                    if (osc.fromBuffer(msg)['args'][3].value === true) {   
                        this.importChords();
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

    initSequence() {
        /**
         * create empty note sequence as a starter
         */ 
        const totalQuantizedSteps = this.state.stepsPerBar * this.state.bars;
        const initSeq: INoteSequence = {
            quantizationInfo: {stepsPerQuarter: this.state.divisor === 3 ? 3 : 4},
            totalQuantizedSteps: totalQuantizedSteps,
            notes: [],
        }
        this.setState({
            noteSequence: initSeq,
        });
    }

    importChords() {
        // import midi file
        fs.readFile(TEMP_DIR.concat(CHORDS_FILE_ARDOUR), (err, data) => {
            if (err) throw err;
            
            // convert midi data to note sequence
            const seq = midiToSequenceProto(data);
            
            // make sure that there are notes before continuing
            if (seq.notes.length === 0) {
                alert('There are no notes in the region provided. Using presets for now.'); 
                return;
            } 
           
            // quantize sequence
            const quantSeq = sequences.quantizeNoteSequence(seq, this.state.divisor);
            const barsProvided = Math.ceil(quantSeq.totalQuantizedSteps / this.state.stepsPerBar);
            /** 
             * make sure that the length of the imported chords file is within the binary log (i.e. 1,2,4,8)
             */ 
            const noOfBars = Math.pow(
                2,
                Math.ceil(Math.log2(barsProvided))
            );
            
            const chordsDetected: string[] = [];
            for (let i = 0; i < noOfBars; i++) {
                // split sequence, restrict chord detection to one bar chunks (might be changed later)
                const barChunk = sequences.trim(quantSeq, this.state.stepsPerBar * i, this.state.stepsPerBar * (i+1));
                // sort by pitches and map midi pitch to note symbol
                const noteSymbols = barChunk.notes.sort((a, b) => {
                    return a.pitch - b.pitch;
                }).map(note => { return Note.fromMidiSharps(note.pitch) });
                // check if note symbols can be translated to a chord, otherwise insert 'N.C.'
                Chord.detect(noteSymbols).length === 0
                    ? chordsDetected.push(constants.NO_CHORD)
                    : chordsDetected.push(Chord.detect(noteSymbols)[0].split(/[/]/)[0]); // get rid of all but the first chord
            }

            // iterate over empty indices ('N.C.') and fill rest of chord prog list
            for (let i = 0; i < chordsDetected.length; i++) {
                if (chordsDetected[i] === constants.NO_CHORD) {
                    chordsDetected[i] = chordsDetected.find(function(el) {
                        return el !== constants.NO_CHORD;
                    });
                }
            }

            /**
             * if there is no chord detected, all elements of the array are undefined,
             * hence just check first element
             */ 
            if (chordsDetected[0] === undefined) {
                alert('No chords detected. Using presets for now.');
                return;
            }

            let chordsList = chordsDetected;
            /**
             * adjusting length of chords detected to fit 8 bars in total,
             * simply repeating provided chords for now 
             */ 
            for (let i = chordsList.length; i < 8; i *= 2) {
                chordsList = chordsList.concat(chordsList);
            }

            this.setState({
                chordProgression: chordsList,
            });
        });
    }

    async generateSequence() {
        this.setState({
            loading: true,
        });
        // create empty sequence
        this.initSequence();
        // create and init magenta model
        this.model = new MusicRNN("https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv");
        const sequence = 
            await this.model
                .initialize()
                .then(() => this.model.continueSequence(
                    this.state.noteSequence,
                    this.state.noteSequence.totalQuantizedSteps,
                    this.state.temperature,
                    this.state.chordProgression.slice(0, 2),
                ));
        
        this.setState({
          noteSequence: sequence,
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
        fs.writeFileSync(TEMP_DIR.concat(MELODY_FILE), midi);
    }

    receiveCurrentNote(note: NoteSequence.INote) {
        this.setState({
            currentNote: note,
        });
    }

    receivePlaybackStatus(isPlaying: boolean) {
        this.setState({
            playerIsActive: isPlaying,
        });
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
                                <NoteVisualizer
                                    currentNote={this.state.currentNote}
                                    noteSequence={this.state.noteSequence}
                                    minNotePitch={MIN_NOTE_PITCH}
                                    maxNotePitch={MAX_NOTE_PITCH}
                                >
                                </NoteVisualizer>    
                                </div>
                                <div id='chord-list'>
                                <ChordView chords={this.state.chordProgression.slice(0, this.state.bars)}></ChordView>
                                </div>
                            </div>
                            <div id='button-area' className='card-footer d-flex justify-content-between'>
                                <div className='footer-left d-flex'>
                                    <button className='btn btn-outline-secondary' onClick={this.generateSequence} disabled={this.state.loading || this.state.playerIsActive}>
                                        <svg id='lightning-icon' className='bi bi-lightning-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                            <path fillRule='evenodd' d='M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z'/>
                                        </svg>
                                    </button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || this.state.bars === 2 || this.state.playerIsActive} onClick={this.halveSequence}>:2</button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || !this.state.noteSequence.notes || this.state.bars === 8 || this.state.playerIsActive} onClick={this.doubleSequence}>x2</button>
                                </div>
                                    <NotePlayer noteSequence={this.state.noteSequence} sendActiveNote={this.receiveCurrentNote} sendPlaybackStatus={this.receivePlaybackStatus}></NotePlayer>
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