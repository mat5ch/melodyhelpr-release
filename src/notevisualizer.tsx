import React from 'react';
import { sequences } from '@magenta/music/node/core';
import { INoteSequence, NoteSequence } from '@magenta/music/node/protobuf/index';

interface NoteVisualizerProps {
  currentNote: NoteSequence.INote;
  noteSequence: INoteSequence;
  minNotePitch: number;
  maxNotePitch: number;
}

class NoteVisualizer extends React.Component<NoteVisualizerProps> {
  canvasWidth: number;
  canvasHeight: number;
  noteHeight: number;

  constructor(props: NoteVisualizerProps) {
    super(props);
    this.noteHeight = 10;
    this.canvasWidth = 97.5; // will be translated to percent later
    this.canvasHeight = (props.maxNotePitch - props.minNotePitch + 1) * this.noteHeight;
  }

  /**
   * Rendering of notes based on Magenta's PianoRollSVGVisualizer,
   * see path: @magenta/music/node/core/visualizer
   * Note: own rendering seems more flexible and suited for usage with React 
   */ 
  render() {
    // const color = this.state.isPlaying ? '#f55' : '#aaa';
    const noteWidth = this.canvasWidth / this.props.noteSequence.totalQuantizedSteps;
    
    return <div className='d-flex justify-content-center'>
      <svg
        id='note-visualizer'
        style={{
          border: `3px solid ${'#aaa'}`,
          background: 'black',
          width: `${this.canvasWidth}%`,
          height: `${this.canvasHeight}px`,
        }}
      >
        {
          this.props.noteSequence.notes?.map((note, id) => (
            <rect
              id={id.toString()}
              className={'note-rect'}
              key={id}
              x={`${note.quantizedStartStep * noteWidth}%`}
              y={(this.canvasHeight - this.noteHeight) - ((note.pitch! - this.props.minNotePitch) * this.noteHeight)}
              width={(note.quantizedEndStep! - note.quantizedStartStep!) * noteWidth * 5}
              height={this.noteHeight}
              stroke={'#555'}
              strokeWidth={'2'}
              fill={note.quantizedStartStep === this.props.currentNote.startTime! * sequences.stepsPerQuarterToStepsPerSecond(this.props.noteSequence.quantizationInfo.stepsPerQuarter, this.props.noteSequence.tempos[0].qpm)
                ? 'red' : 'gray'}
            />
          ))
        }
      </svg>
    </div>;
  }
}

export default NoteVisualizer;