import { basicSetup, EditorView } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { python } from '@codemirror/lang-python';
import { indentUnit } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { $, $$ } from 'basic-devtools' 
import { PyWorker, hooks } from "@pyscript/core";

const RUNBUTTON = `<svg style="height:20px;width:20px;vertical-align:-.125em;transform-origin:center;overflow:visible;color:green" viewBox="0 0 384 512" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg"><g transform="translate(192 256)" transform-origin="96 0"><g transform="translate(0,0) scale(1,1)"><path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z" fill="currentColor" transform="translate(-192 -256)"></path></g></g></svg>`;

const precode = `
import sys
from pyscript import sync
from pyodide.ffi import create_proxy

class MyStdout:
    def write(self, line):
        sync.write(line)

class MyStderr:
    def write(self, line):
        sync.writeErr(line)

sys.stdout = MyStdout()  
sys.stderr = MyStderr()

sync.run_code = create_proxy(eval)
`

//hooks.worker.codeBeforeRun.add(precode)
//hooks.worker.onReady.add((wrap, xw) => console.log())

let _uniqueIdCounter = 0;
function ensureUniqueId(el) {
    if (el.id === '') el.id = `py-internal-${_uniqueIdCounter++}`;
}

// Portions of this code are adapted from code in the PyScript project, licensed under Apache License 2.0
// Full license information is here: https://github.com/pyscript/pyscript/blob/main/LICENSE

class PyCodeMirror extends HTMLElement {
    outDiv ;
    editor ;
    stdout_manager;
    stderr_manager;
    static observedAttributes = ['src'];
    preCode;
    postCode;
    worker;
    connectedCallback() {
        ensureUniqueId(this);

        if (!this.hasAttribute('exec-id')) {
            this.setAttribute('exec-id', '0');
        }
        if (!this.hasAttribute('root')) {
            this.setAttribute('root', this.id);
        }

        const pySrc = ""
        this.innerHTML = '';
        const boxDiv = this.makeBoxDiv();
        const shadowRoot = $('.py-codemirror-editor > div', boxDiv).attachShadow({ mode: 'open' });
        // avoid inheriting styles from the outer component
        shadowRoot.innerHTML = `<style> :host { all: initial; }</style>`;
        this.appendChild(boxDiv);
        this.editor = this.makeEditor(pySrc, shadowRoot);
        this.editor.focus();
        console.debug(`element ${this.id} successfully connected`);
    }


    /** Create and configure the codemirror editor
     */
    makeEditor(pySrc, parent) {
        const languageConf = new Compartment();
        const extensions = [
            indentUnit.of('    '),
            languageConf.of(python()),
            keymap.of([
                ...defaultKeymap,
                { key: 'Ctrl-Enter', run: this.execute.bind(this), preventDefault: true },
                { key: 'Shift-Enter', run: this.execute.bind(this), preventDefault: true },
            ]),
            basicSetup,
        ];

        return new EditorView({
            doc: pySrc,
            extensions: extensions,
            parent: parent,
        });
    }

    // ******** main entry point for py-codemirror DOM building **********
    //
    // The following functions are written in a top-down, depth-first
    // order (so that the order of code roughly matches the order of
    // execution)
    makeBoxDiv() {
        const boxDiv = document.createElement('div');
        boxDiv.className = 'py-codemirror-box';

        const editorDiv = this.makeEditorDiv();
        this.outDiv = this.makeOutDiv();

        boxDiv.appendChild(editorDiv);
        boxDiv.appendChild(this.outDiv);

        return boxDiv;
    }

    makeEditorDiv() {
        const editorDiv = document.createElement('div');
        editorDiv.className = 'py-codemirror-editor';
        editorDiv.setAttribute('aria-label', 'Python Script Area');

        const runButton = this.makeRunButton();
        const editorShadowContainer = document.createElement('div');

        // avoid outer elements intercepting key events (reveal as example)
        editorShadowContainer.addEventListener('keydown', event => {
            event.stopPropagation();
        });

        editorDiv.append(editorShadowContainer, runButton);

        return editorDiv;
    }

    makeRunButton() {
        const runButton = document.createElement('button');
        runButton.className = 'absolute py-codemirror-run-button';
        runButton.innerHTML = RUNBUTTON;
        runButton.setAttribute('aria-label', 'Python Script Run Button');
        runButton.addEventListener('click', this.execute.bind(this));
        return runButton;
    }

    makeOutDiv() {
        const outDiv = document.createElement('div');
        outDiv.className = 'py-codemirror-output';
        outDiv.id = this.id + '-codemirror-output';
        return outDiv;
    }

    //  ********************* execution logic *********************

    /** Execute the python code written in the editor, and automatically
     *  display() the last evaluated expression
     */
    async execute() {
        if (!this.worker){ 
            // set up worker
            this.worker= new PyWorker(URL.createObjectURL((new Blob([precode]))))
            //await this.worker.evaluate_some_code("print('Hello world')")
        }

        var pySrc = this.getPySrc();
        if (this.preCode) pySrc = this.preCode + "\n" + pySrc
        if (this.postCode) pySrc = pySrc + "\n" + this.postCode

        const srcLink = URL.createObjectURL((new Blob([pySrc])))
        this.outDiv.innerHTML = ""

        this.worker.sync.write = (str) => {this.outDiv.innerText += str}
        this.worker.sync.writeErr = (str) => {this.outDiv.innerHTML += `<span style='color:red'>${str}</span>`}
        this.worker.onerror = ({error}) => {this.outDiv.innerHTML += `<span style='color:red'>${str}</span>`; console.log(error)}

        await this.worker.sync.run_code("print('hello from sync')")
    }

    getPySrc() {
        return this.editor.state.doc.toString();
    }
}

customElements.define("py-codemirror", PyCodeMirror)