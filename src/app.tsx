/* CSS imports */
import './styles/index.css';
import './styles/bootstrap.min.css';
/* JS libs imports */
import React from "react";
import ReactDOM from "react-dom";
import fs from "fs";
import os from "os";
import udp from "dgram";
import osc from "osc-min";

interface MelodyhelprProps {
    title?: string,
}

const PORT = 7890;
const HOME_DIR = os.homedir();
const TEMP_DIR = HOME_DIR.concat("/ardour_electron");
const CONN_FILE = "/connected.txt";

class Melodyhelpr extends React.Component<MelodyhelprProps> {
    
    constructor(props: MelodyhelprProps) {
        super(props);
        if (props.title) document.title = props.title;
        this.openSocket = this.openSocket.bind(this);
    }

    componentDidMount() {
        this.openSocket();
    }

    openSocket() {
        const sock = udp.createSocket("udp4", (msg, rinfo) => {
            let error, error1;
            try {
                // handle messages sent from Ardour (destructering of incoming msgs)
                if (osc.fromBuffer(msg)["address"] === "SEQ_INFO") {
                    
                    // check if boolean flag (exp_chords) in Ardour has been set
                    if (osc.fromBuffer(msg)["args"][3].value === true) {  
                    }
                    
                }
                // establish connection with Ardour (basic fs check for now)
                if (osc.fromBuffer(msg)["address"] === "CONNECT") {
                    fs.writeFile(TEMP_DIR.concat(CONN_FILE), "connect", "utf8", err => {
                        if (err) throw err;
                        console.log("The file has been written!");
                    });
                }
                return console.log(osc.fromBuffer(msg));
            } catch (error1) {
                error = error1;
                return console.log("Error: ", error);
            }
        });
        sock.bind(PORT);
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
                                    <button className="btn btn-outline-secondary">
                                        <svg className="bi bi-shuffle" width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                          <path fillRule="evenodd" d="M12.646 1.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 4l-2.147-2.146a.5.5 0 0 1 0-.708zm0 8a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L14.793 12l-2.147-2.146a.5.5 0 0 1 0-.708z" />
                                          <path fillRule="evenodd" d="M0 4a.5.5 0 0 1 .5-.5h2c3.053 0 4.564 2.258 5.856 4.226l.08.123c.636.97 1.224 1.865 1.932 2.539.718.682 1.538 1.112 2.632 1.112h2a.5.5 0 0 1 0 1h-2c-1.406 0-2.461-.57-3.321-1.388-.795-.755-1.441-1.742-2.055-2.679l-.105-.159C6.186 6.242 4.947 4.5 2.5 4.5h-2A.5.5 0 0 1 0 4z" />
                                          <path fillRule="evenodd" d="M0 12a.5.5 0 0 0 .5.5h2c3.053 0 4.564-2.258 5.856-4.226l.08-.123c.636-.97 1.224-1.865 1.932-2.539C11.086 4.93 11.906 4.5 13 4.5h2a.5.5 0 0 0 0-1h-2c-1.406 0-2.461.57-3.321 1.388-.795.755-1.441 1.742-2.055 2.679l-.105.159C6.186 9.758 4.947 11.5 2.5 11.5h-2a.5.5 0 0 0-.5.5z" />
                                        </svg>
                                    </button>
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