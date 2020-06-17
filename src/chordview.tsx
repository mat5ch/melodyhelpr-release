import React from 'react';

interface ChordViewProps {
    activeChord: number; // index
    chords: string[];
}

function ChordView(props: ChordViewProps) {
  const chordColumns = props.chords.map((chord, idx) => {
    const color = (idx === props.activeChord) ? 'rgba(255,20,20,0.5)' : 'rgba(200,200,200,0.5)';
    return <div className='col' key={idx}><p className='chord-char' style={{backgroundColor: color}}>{chord}</p></div>;
  });

  return <div id='chordview-container' className='d-flex justify-content-center'>{chordColumns}</div>;
}

export default ChordView;