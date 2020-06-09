import React from "react";

interface ChordViewProps {
    chords: string[];
}

function ChordView(props: ChordViewProps) {
  const chordColumns = props.chords.map((chord, idx) => {
    // remove unnecessary symbols in chords
    const chordToOmit = chord.indexOf("64");
    chord = chordToOmit === -1 ? chord : chord.slice(0, chordToOmit);
    return <div className="col" key={idx}>{chord}</div>;
  });

  return <div className="row d-flex justify-content-center">{chordColumns}</div>;
}

export default ChordView;