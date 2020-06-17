import { Chord, Note, Scale, Collection, PcSet, Interval, distance, note } from '@tonaljs/tonal';
import { INoteSequence } from '@magenta/music/node/protobuf';

// values according to min/max pitches accepted by improvRNN model
const MIN_NOTE_PITCH = 48; // -> C3
const MAX_NOTE_PITCH = 83; // -> B5
const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJ_CHROMA = Scale.get('major').chroma.split('');
const MIN_CHROMA = Scale.get('minor').chroma.split('');
// create major/minor keys by filtering out the wrong notes via the chromas 'MAJ_CHROMA/MIN_CHROMA'
const MAJORS = ALL_NOTES.map((_, idx) => {
    const chroma = Collection.rotate(0-idx, MAJ_CHROMA);
    return ALL_NOTES.filter((_, idx) => chroma[idx] === '1');
});
const MINORS = ALL_NOTES.map((_, idx) => {
    const chroma = Collection.rotate(0-idx, MIN_CHROMA);
    return ALL_NOTES.filter((_, idx) => chroma[idx] === '1');
});

export function findScale(noteSeq: INoteSequence) {
    const notePitchesUnique = Scale.scaleNotes(noteSeq.notes.map(note => Note.fromMidiSharps(note.pitch)));
    const scalesFound = [];
    for (let i = 0; i < MAJORS.length; i++) {
        const inMajor = PcSet.isSubsetOf(MAJORS[i]);
        if (PcSet.isEqual(notePitchesUnique, MAJORS[i]) || inMajor(notePitchesUnique)) {
             scalesFound.push({ root: ALL_NOTES[i], key: 'major'});
        }
    }
    for (let i = 0; i < MINORS.length; i++) {
        const inMinor = PcSet.isSubsetOf(MINORS[i]);
        if (PcSet.isEqual(notePitchesUnique, MINORS[i]) || inMinor(notePitchesUnique)) {
             scalesFound.push({ root: ALL_NOTES[i], key: 'minor'});
        }
    }
    return scalesFound;
}

export function fitToScale(noteSeq: INoteSequence, scaleFound: {root: string, key: string}) {
    const root = scaleFound.root;
    const scale = scaleFound.key === 'major' ? MAJORS[ALL_NOTES.indexOf(root)] : MINORS[ALL_NOTES.indexOf(root)];
    noteSeq.notes.map(note => {
        const noteStr = Note.fromMidiSharps(note.pitch);
        if (scale.indexOf(Note.pitchClass(noteStr)) === -1) {
            if (note.pitch === MAX_NOTE_PITCH) { note.pitch -= 1; }
            else { note.pitch += 1; }  
        }
        return note;
    });
    return noteSeq;
}

export function getNotesFromChord(chord: string, octave: string) {
    const chordToken = Chord.tokenize(chord);
    return Chord.getChord(chordToken[1], chordToken[0].concat(octave)).notes;
}