import React from 'react';
import { Player } from '@magenta/music/node/core';
import { INoteSequence, NoteSequence } from '@magenta/music/node/protobuf/index';

interface NotePlayerProps {
    noteSequence: INoteSequence;
    sendActiveNote: (note: NoteSequence.INote) => void;
    sendPlaybackStatus: (isPlaying: boolean) => void;
}

interface NotePlayerState {
    isPlaying: boolean;
}

class NotePlayer extends React.Component<NotePlayerProps, NotePlayerState> {
    player: Player | undefined;

    constructor(props: NotePlayerProps) {
        super(props);
        this.state = {
            isPlaying: false,
        }
        this.play = this.play.bind(this);
    }

    componentDidMount() {
        this.player = new Player(false, {
            run: note => {
              // call method in props to notify parent about the current note
              this.props.sendActiveNote(note);
            },
            stop: () => {
              if (this.player)
                this.player.start(this.props.noteSequence);
            }
        });
    }

    play() {
        if (!this.props.noteSequence.notes) {   
            return;
        }
        
        if (this.player) {
            if (!this.state.isPlaying) {
                this.player!.resumeContext();
                this.player!.start(this.props.noteSequence);
            } else {
                this.player.stop();
            }
        }

        this.props.sendPlaybackStatus(!this.state.isPlaying);
        
        this.setState((prevState) => ({
            isPlaying: !prevState.isPlaying
        }));
    }

    render() {
        return (    
            <button id='playStop-btn' className='btn btn-outline-secondary' onClick={this.play}>
                { !this.state.isPlaying 
                    ? 
                    <svg id='play-icon' className='bi bi-play-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z' />
                    </svg>
                    :
                    <svg id='stop-icon' className='bi bi-stop-fill' width='1.5em' height='1.5em' viewBox='0 0 16 16' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z'/>
                    </svg>
                }
            </button>
        )
    }
}

export default NotePlayer;