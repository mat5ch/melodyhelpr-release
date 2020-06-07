import React from "react";

interface ChordViewProps {
    chords: string[];
}

function ChordView(props: ChordViewProps) {
  const chordColumns = props.chords.map((chord, idx) => {
    return <div className="col" key={idx}>{chord}</div>;
  });

  return <div className="row d-flex justify-content-center">{chordColumns}</div>;
}

export default ChordView;