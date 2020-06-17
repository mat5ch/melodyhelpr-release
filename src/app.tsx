/* CSS imports */
import './styles/index.css';
import './styles/bootstrap.min.css';
/* JS libs imports */
import React from 'react';
import ReactDOM from 'react-dom';
import fs from 'fs';
import os from 'os';
import path from 'path';
import udp from 'dgram';
import osc from 'osc-min';
import { MusicRNN } from '@magenta/music/node/music_rnn';
import { INoteSequence, NoteSequence } from '@magenta/music/node/protobuf';
import { midiToSequenceProto, sequenceProtoToMidi, sequences, Player } from '@magenta/music/node/core';
import { Chord, Note, distance, Interval } from '@tonaljs/tonal';
import NoteVisualizer from './notevisualizer';
import ChordView from './chordview';
import * as Helpers from './helpers';

const PORT = 7890;
const HOME_DIR = os.homedir();
const TEMP_DIR = path.join(HOME_DIR, 'ardour_electron');
const CONN_FILE = path.join(TEMP_DIR, 'connected.txt');
const MELODY_FILE = path.join(TEMP_DIR, 'melody.mid');
const CHORDS_FILE_ARDOUR = path.join(TEMP_DIR, 'chords.mid');
const CHORDS_FILE = path.join(TEMP_DIR, 'chordsNew.mid');
// standard chord progression, make sure to provide chords compatible with Magenta model!
const CHORDS = ['CMaj7', 'GM', 'Am', 'Fsus2', 'CM', 'GM', 'A7sus4', 'FM'];
const CHORDS_VALS = CHORDS.map(chord => Helpers.getNotesFromChord(chord, '3'));
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
    scale: { root: string, key: string };
    chords: string;
    chordProgression: string[];
    currentNote: NoteSequence.INote;
    activeChord: number;
    chordSequence: INoteSequence;
    melodySequence: INoteSequence;
    loading: boolean;
    playbackTriggered: boolean;
    temperature: number;
}

class Melodyhelpr extends React.Component<MelodyhelprProps, MelodyhelprState> {
    model: MusicRNN | undefined;
    player: Player | undefined;
    
    constructor(props: MelodyhelprProps) {
        super(props);
        if (props.title) document.title = props.title;
        this.state = {
            qpm: 120, // -> bpm
            divisions: 4,
            divisor: 4,
            bars: 2,
            stepsPerBar: 16, // => 4 quarters a 4 steps
            scale: { root: 'C', key: 'major' },
            chords: 'presets',
            chordProgression: CHORDS,
            currentNote: {},
            activeChord: undefined,
            chordSequence: {},
            melodySequence: {},
            loading: false,
            playbackTriggered: false,
            temperature: 1.0, // randomness
        };
        // this.model = undefined;
        this.openSocket = this.openSocket.bind(this);
        this.createSoundPlayer = this.createSoundPlayer.bind(this);
        this.initSequence = this.initSequence.bind(this);
        this.createChordSequence = this.createChordSequence.bind(this);
        this.createOutputSequence = this.createOutputSequence.bind(this);
        this.importChords = this.importChords.bind(this);
        this.generateSequence = this.generateSequence.bind(this);
        this.changeTemp = this.changeTemp.bind(this);
        this.doubleSequence = this.doubleSequence.bind(this);
        this.halveSequence = this.halveSequence.bind(this);
        this.transferToArdour = this.transferToArdour.bind(this);
        this.triggerPlayback = this.triggerPlayback.bind(this);
        this.updateCurrentNote = this.updateCurrentNote.bind(this);
        this.colorizeChord = this.colorizeChord.bind(this);
    }
    
    componentDidMount() {
        this.createSoundPlayer();
        this.openSocket();
        // setup chord sequence for presets
        this.setState({
            chordSequence: this.createChordSequence(CHORDS_VALS),
        });
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
                        stepsPerBar: divisions * 4, // calc stepsPerBar according to divisions
                    });
                    if (osc.fromBuffer(msg)['args'][3].value === true) {   
                        this.importChords();
                    } 
                    this.generateSequence();
                }
                // establish connection with Ardour (basic fs check for now)
                if (osc.fromBuffer(msg)['address'] === 'CONNECT') {
                    fs.writeFile(CONN_FILE, 'connect', 'utf8', err => {
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

    createSoundPlayer() {
        this.player =
            new Player(false, {
                run: note => {
                    const sPQu = this.state.melodySequence.quantizationInfo.stepsPerQuarter;
                    // calculate quantized start step of a note from its start time (in sec) and steps per second
                    note.quantizedStartStep = Number.parseInt((note.startTime * sequences.stepsPerQuarterToStepsPerSecond(sPQu, this.state.qpm)).toFixed(0));
                    // notify visualizer about the current note, excluding chord notes (instrument 5)
                    if (note.instrument === 5) {
                        this.colorizeChord(note);
                    } else {
                        this.updateCurrentNote(note);
                    }
                },
                // restart player automatically (subject to change if looping is not wanted)
                stop: () => {
                    if (this.player) this.player.start(this.createOutputSequence(), this.state.qpm);
                }
        });
    }

    initSequence() {
        // create empty note sequence
        const initSeq: INoteSequence = {
            quantizationInfo: {stepsPerQuarter: this.state.divisor === 3 ? 3 : 4},
            totalQuantizedSteps: this.state.bars * this.state.stepsPerBar,
            tempos: [{ qpm: this.state.qpm, time: 0 }],
            notes: [],
        }
        return initSeq;
    }

    createChordSequence(vals: string[][]) {
      const ns = this.initSequence();
      ns.notes = 
        vals.reduce((acc: NoteSequence.INote[], chord, idx) => {
            const startNote = chord[0];
            const startingPitch = Note.midi(startNote);
            const notePitches = chord.map(val => startingPitch + Interval.semitones(distance(startNote, val)));
            const notes = notePitches.map(pitch => 
              new NoteSequence.Note({
                  pitch: pitch,
                  instrument: 5,
                  velocity: 80,
                  quantizedStartStep: idx * this.state.stepsPerBar,
                  quantizedEndStep: (idx + 1) * this.state.stepsPerBar 
              })
          );
          return acc.concat(notes);
      }, []);
      return ns;
    }

    createOutputSequence() {
        const ns: INoteSequence = this.initSequence();
        if (this.state.melodySequence) {
            sequences.trim(this.state.chordSequence, 0, this.state.stepsPerBar * this.state.bars).notes.forEach(note => {
                ns.notes.push(note);
            });
            this.state.melodySequence.notes.forEach(note => {
                ns.notes.push(note);
            });                        
        }
        return ns;
    }

    importChords() {
        // import midi file
        fs.readFile(CHORDS_FILE_ARDOUR, (err, data) => {
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
            // make sure that the length of the imported chords file is within the binary log (i.e. 1,2,4,8)
            const barsProvided = Math.ceil(quantSeq.totalQuantizedSteps / this.state.stepsPerBar);
            const noOfBars = Math.pow(
                2,
                Math.ceil(Math.log2(barsProvided))
            );
            const chordsDetected: string[] = [];
            for (let i = 0; i < noOfBars; i++) {
                // split sequence, restrict chord detection to one bar chunks (might be changed later)
                const barChunk = sequences.trim(quantSeq, this.state.stepsPerBar * i, this.state.stepsPerBar * (i+1));
                // sort by pitches and map midi pitch to note symbol (pitches are not sorted after importing midi file!)
                const noteSymbols = 
                    barChunk.notes.sort((a, b) => a.pitch - b.pitch)
                    .map(note => { return Note.fromMidiSharps(note.pitch)});
                // fill respective array with appropriate chord symbols
                chordsDetected.push(Chord.detect(noteSymbols)[0]); 
            }
            // if there is no chord detected, return from function
            if (chordsDetected.length === 0) {
                alert('No chords detected. Using previous ones.');
                return;
            }
            /**
             * check if note symbols could be translated to a chord, fill with first non undefined value
             * Magenta Model does not accept the 'N.C.' value (why?)
             */ 
            for (let i = 0; i < chordsDetected.length; i++) {
                if (chordsDetected[i] === undefined) {
                    chordsDetected[i] = chordsDetected.find(el => {
                        return el !== undefined;
                    });
                }
            }
            let chordsList = chordsDetected;
            // fill notes array to use for creating the chord sequence
            let notes: string[][] = 
                chordsDetected.map(chord => {
                    return Helpers.getNotesFromChord(chord, '3');
                });
            /**
             * adjusting length of the note sequence and chords list to fit 8 bars in total,
             * simply repeating the arrays for now 
             */ 
            for (let i = chordsList.length; i < 8; i *= 2) {
                chordsList = chordsList.concat(chordsList);
                notes = notes.concat(notes);
            }
            // create chord sequence (INoteSequence)
            const chordSeq = this.createChordSequence(notes);
            const scaleDetected = Helpers.findScale(chordSeq)[0];
            if (!scaleDetected) return;
            
            this.setState({
                chordProgression: chordsList,
                chordSequence: chordSeq,
                chords: 'custom',
                scale: scaleDetected,
            });
        });
    }

    async generateSequence() {
        this.setState({
            loading: true,
        });
        // create empty sequence
        const emptySeq = this.initSequence();
        // init magenta model
        this.model = new MusicRNN("https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv");      
        // try to create start sequence (based on empty note sequence)
        const sequenceFromMagenta: INoteSequence = 
            await this.model
                .initialize()
                .catch((err) => { console.log(err); return undefined })
                .then(() => this.model.continueSequence(
                    emptySeq,
                    emptySeq.totalQuantizedSteps,
                    this.state.temperature,
                    this.state.chordProgression.slice(0, 2),
                ))
                .catch((err) => { console.log(err); return undefined });     
        
        if (!sequenceFromMagenta) { 
            alert('Something went wrong. Check your internet connection and reload.');
            return; 
        }
        const melSequence = Helpers.fitToScale(sequenceFromMagenta, this.state.scale); // fit to scale   
        melSequence.tempos = [{ qpm: this.state.qpm, time: 0 }]; // reset tempo info to right value, important!
               
        this.setState({
          melodySequence: melSequence,
          loading: false,
        });
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

        const sequenceFromMagenta = await this.model.continueSequence(
            this.state.melodySequence,
            outputLength,
            this.state.temperature,
            this.state.chordProgression.slice(
            this.state.bars,
            this.state.bars * 2
            )
        )
        .catch((err) => { console.log(err); return undefined });

        if (!sequenceFromMagenta) {  
            alert('Something went wrong. Check your internet connection.');
            // set loading to false to enable buttons again
            this.setState({
                loading: false,
            });
            return; 
        }
        const continuation = Helpers.fitToScale(sequenceFromMagenta, this.state.scale); // remember to adjust to scale!
        
        const outputSequence = sequences.concatenate([
            this.state.melodySequence,
            continuation
        ]); 
        
        this.setState(prevState => {
            return {
                melodySequence: outputSequence,
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
            this.state.melodySequence,
            0,
            (this.state.stepsPerBar * this.state.bars) / 2
        );

        this.setState(prevState => {
            return {
              melodySequence: halvedSequence,
              bars: prevState.bars / 2,
              loading: false,
            };
        });
    }

    transferToArdour() {
         // write chords midi file when using presets
        if (this.state.chords === 'presets') {
            const chordSeq = sequences.trim(this.state.chordSequence, 0, this.state.bars * this.state.stepsPerBar);
            const midiChords = sequenceProtoToMidi(chordSeq);
            fs.writeFileSync(CHORDS_FILE, midiChords);
        }
        // explicitely set a velocity for all notes in the sequence, otherwise midi file does not contain any notes
        const notes = this.state.melodySequence.notes.map(note => {
            note.velocity = 80;
            return note;
        });
        this.state.melodySequence.notes = notes;
        // give the note sequence the right time info
        this.state.melodySequence.timeSignatures.push({time: 0, numerator: this.state.divisions, denominator: this.state.divisor});
        // create midi file with generated note sequence 
        const midi = sequenceProtoToMidi(this.state.melodySequence);
        fs.writeFileSync(MELODY_FILE, midi);
    }

    triggerPlayback() {     
        if (this.player.isPlaying()) {
            this.player.stop();
        }
        else {
            const outputSeq = this.createOutputSequence();
            this.player.start(outputSeq);
        }
        this.setState(state => ({
            playbackTriggered: !state.playbackTriggered,  
        }));
    }

    updateCurrentNote(note: NoteSequence.INote) {
        this.setState({
            currentNote: note,
        });
    }

    colorizeChord(note: NoteSequence.INote) {
        this.setState({
            activeChord: note.quantizedStartStep / this.state.stepsPerBar
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
                                    noteSequence={this.state.melodySequence}
                                    minNotePitch={MIN_NOTE_PITCH}
                                    maxNotePitch={MAX_NOTE_PITCH}
                                >
                                </NoteVisualizer>    
                                </div>
                                <div id='chord-list'>
                                <ChordView activeChord={this.state.activeChord} chords={this.state.chordProgression.slice(0, this.state.bars)}></ChordView>
                                </div>
                                <div id='scale-info-box' className='d-flex justify-content-center'>
                                    {`Scale: ${this.state.scale.root} ${this.state.scale.key}`}
                                </div>
                            </div>
                            <div id='button-area' className='card-footer d-flex justify-content-between'>
                                <div className='footer-left d-flex'>
                                    <button className='btn btn-outline-secondary' onClick={this.generateSequence} disabled={this.state.loading || this.state.playbackTriggered}>
                                        <svg id='lightning-icon' className='bi bi-lightning-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                            <path fillRule='evenodd' d='M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z'/>
                                        </svg>
                                    </button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || this.state.bars === 2 || this.state.playbackTriggered} onClick={this.halveSequence}>:2</button>
                                    <button className='btn btn-outline-secondary' disabled={this.state.loading || !this.state.melodySequence.notes || this.state.bars === 8 || this.state.playbackTriggered} onClick={this.doubleSequence}>x2</button>
                                </div>
                                <button id='playStop-btn' className='btn btn-outline-secondary' disabled={this.state.loading || !this.state.melodySequence.notes} onClick={this.triggerPlayback}>
                                    {!this.state.playbackTriggered
                                        ?
                                        <svg id='play-icon' className='bi bi-play-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                            <path d='M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z' />
                                        </svg>
                                        :
                                        <svg id='stop-icon' className='bi bi-stop-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                                            <path d='M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z' />
                                        </svg>
                                    }
                                </button>
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