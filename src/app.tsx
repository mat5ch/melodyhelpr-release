/* CSS imports */
import './styles/index.css';
import './styles/bootstrap.min.css';
/* JS libs imports */
import React from "react";
import ReactDOM from "react-dom";

interface MelodyhelprProps {
    title: string,
}

class Melodyhelpr extends React.Component {
    constructor(props: MelodyhelprProps) {
        super(props);
    }

    render() {
        return (
            <div className="container">
                <div className="row">
                    <div className="col">
                        <h1 id="main-title" className="text-center">Melody Helpr</h1>
                    </div>
                </div>
                <div className="row">
                    <div className="col">
                        <div className="card text-center">
                            <div className="card-title">
                                Waiting for Ardour to connect.
                    </div>
                            <div className="card-body">
                                <p id="status-bar">
                                    Status: Bars | BPM | Randomness
                        </p>
                                <div id="note-player">

                                </div>
                                <div id="chord-list">

                                </div>
                            </div>
                            <div className="card-footer d-flex">
                                <div className="footer-left">
                                    <button className="btn btn-outline-secondary">Transfer</button>
                                </div>
                                <div className="footer-right d-flex">
                                    <button className="btn btn-outline-secondary">:2</button>
                                    <button className="btn btn-outline-secondary">x2</button>
                                    <button className="btn btn-outline-secondary"><svg className="bi bi-shuffle" width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <path fill-rule="evenodd" d="M12.646 1.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 4l-2.147-2.146a.5.5 0 0 1 0-.708zm0 8a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 12l-2.147-2.146a.5.5 0 0 1 0-.708z" />
                                        <path fill-rule="evenodd" d="M0 4a.5.5 0 0 1 .5-.5h2c3.053 0 4.564 2.258 5.856 4.226l.08.123c.636.97 1.224 1.865 1.932 2.539.718.682 1.538 1.112 2.632 1.112h2a.5.5 0 0 1 0 1h-2c-1.406 0-2.461-.57-3.321-1.388-.795-.755-1.441-1.742-2.055-2.679l-.105-.159C6.186 6.242 4.947 4.5 2.5 4.5h-2A.5.5 0 0 1 0 4z" />
                                        <path fill-rule="evenodd" d="M0 12a.5.5 0 0 0 .5.5h2c3.053 0 4.564-2.258 5.856-4.226l.08-.123c.636-.97 1.224-1.865 1.932-2.539C11.086 4.93 11.906 4.5 13 4.5h2a.5.5 0 0 0 0-1h-2c-1.406 0-2.461.57-3.321 1.388-.795.755-1.441 1.742-2.055 2.679l-.105.159C6.186 9.758 4.947 11.5 2.5 11.5h-2a.5.5 0 0 0-.5.5z" />
                                    </svg></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

ReactDOM.render(<Melodyhelpr />, document.getElementById("my-app"));