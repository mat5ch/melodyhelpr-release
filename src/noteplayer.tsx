import React from 'react';
import { Player, sequences } from '@magenta/music/node/core';
import { INoteSequence, NoteSequence } from '@magenta/music/node/protobuf/index';

interface NotePlayerProps {
  noteSequence: INoteSequence;
  play: boolean;
}

interface NotePlayerState {
  isPlaying: boolean;
  activeNote: NoteSequence.INote;
}

// values according to min/max pitches accepted by improvRNN model (see in app.tsx)
const MIN_NOTE_PITCH = 48;
const MAX_NOTE_PITCH = 83;

class NotePlayer extends React.Component<NotePlayerProps, NotePlayerState> {
  player: Player | undefined;
  canvasWidth: number;
  canvasHeight: number;
  noteHeight: number;

  constructor(props: NotePlayerProps) {
    super(props);
    this.noteHeight = 10;
    this.canvasWidth = 97.5; // will be translated to percent later
    this.canvasHeight = (MAX_NOTE_PITCH - MIN_NOTE_PITCH + 1) * this.noteHeight;
    this.state = {
      isPlaying: false,
      activeNote: {},
    };
    this.play = this.play.bind(this);
  }

  componentDidMount() {
    this.player = new Player(false, {
      run: note => {
        this.setState({
          activeNote: note,
        });
      },
      stop: () => {
        if (this.player)
          this.player.start(this.props.noteSequence);
      }
    });
  }

  play() {
    if (this.player) {
      if (!this.state.isPlaying) {
        this.player!.resumeContext();
        this.player!.start(this.props.noteSequence);
      } else {
        this.player.stop();
      }
    }
    this.setState((prevState) => ({
      isPlaying: !prevState.isPlaying
    }));
  }
  
  /**
   * Rendering of notes based on Magenta's PianoRollSVGVisualizer,
   * see path: @magenta/music/node/core/visualizer
   * Note: own rendering seems more flexible and suited for usage with React 
   */ 
  render() {
    const color = this.state.isPlaying ? '#f55' : '#aaa';
    const noteWidth = this.canvasWidth / this.props.noteSequence.totalQuantizedSteps;
    
    return <div className='d-flex justify-content-center'>
      <svg
        id='note-visualizer'
        style={{
          border: `5px solid ${color}`,
          background: 'black',
          width: `${this.canvasWidth}%`,
          height: `${this.canvasHeight}px`,
        }}
        onClick={this.play}
      >
        {
          this.props.noteSequence.notes?.map((note, id) => (
            <rect
              key={id}
              x={`${note.quantizedStartStep * noteWidth}%`}
              y={(this.canvasHeight - this.noteHeight) - ((note.pitch! - MIN_NOTE_PITCH) * this.noteHeight)}
              width={(note.quantizedEndStep! - note.quantizedStartStep!) * noteWidth * 5}
              height={this.noteHeight}
              stroke={'#555'}
              strokeWidth={'2'}
              fill={note.quantizedStartStep === this.state.activeNote.startTime! * sequences.stepsPerQuarterToStepsPerSecond(this.props.noteSequence.quantizationInfo.stepsPerQuarter, this.props.noteSequence.tempos[0].qpm)
                ? 'red' : 'gray'}
            />
          ))
        }
      </svg>
    </div>;
  }
}

export default NotePlayer;