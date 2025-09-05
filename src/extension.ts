import * as vscode from "vscode";
import { execFileSync, spawnSync } from "child_process";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'isamViewer.binaryEditor',
            new BinaryEditorProvider(context),
            {
                supportsMultipleEditorsPerDocument : true 
            }
        )
    )
}

const outputChannel = vscode.window.createOutputChannel("ISAM Viewer");

function escapeBuffer(buf: Buffer): string {
  let result : string[] = [];
  for (const byte of buf) {
    // 0-9, A-Z, a-z
    if ((byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || byte == 0x20 ) {
      result.push(`'${String.fromCharCode(byte)}'`);
    } else {
      result.push(`${byte.toString(16).padStart(2, "0")}`);
    }
  }
  return result.join(',');
}

class BinaryEditorProvider implements vscode.CustomReadonlyEditorProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri , dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Configurar webview
        webviewPanel.webview.options = {
            enableScripts: true ,                        
        };

        // if( !fs.existsSync( document.fileName.split('.')[0] + '.json' ) ){
        //     const arquivos = await vscode.window.showOpenDialog({
        //         canSelectMany: false, 
        //         openLabel: 'Escolher arquivo',
        //         filters: {
        //             'Todos os Arquivos': ['cbl','CBL','idy','IDY']
        //         }
        //     });
        // }

        // const options = [ "Teste1" , "Teste2" , "Teste3" ];
        // const register_selected = await vscode.window.showQuickPick(
        //     options ,
        //     { canPickMany : false }
        // )

        const command = `C:/SIFN/projetos/mf-export-symbols/build/debug/Exprcdl.exe`;
        const fileName = path.win32.resolve( document.uri.fsPath );
        const jsonFilename = path.format({ dir: fs.mkdtempSync( path.join(os.tmpdir(),'ISAMViewer')) , name: path.parse( fileName ).name , ext: ".json" })
        const result = spawnSync( command , ["--json", fileName , "-o" , jsonFilename ] , { encoding: "utf-8" });

        if( !fs.existsSync(jsonFilename) ){
            throw "Error on exec export" ;
        }
        let dados ;
        try{
            dados = JSON.parse(fs.readFileSync(jsonFilename,'utf-8'));
        }catch(e){
            console.error(e);
        }
        
		const records = dados.records ;
        
        let keysByType : Map<string,string[]> = new Map() , keyTypes : string[] = [] ;
        for( const [ key_name , defs ] of Object.entries(dados.key_def) ){
            const def : any = defs ;
            keyTypes.push(key_name);
            keysByType.set( key_name , 
                records.map(
                    (node:any)=> Array.from(def).reduce((prev:string,curr:any)=> {
                        const buffer = Buffer.from(node.record,'utf-8');
                        const start_pos = parseInt(curr.offset);
                        const end_pos = start_pos + parseInt(curr.length) ;
                        const new_value = buffer.subarray(start_pos,end_pos);
                        return prev + escapeBuffer(new_value) + ',';
                    },"")
                )
            );
        }

		webviewPanel.webview.html = getWebviewContent(keyTypes, keysByType, records);
        webviewPanel.webview.onDidReceiveMessage(message =>{
            switch( message.command ){
                case "increaseLimit":
                    outputChannel.appendLine("Novo limit:" + message.newLimit );
            }
        });
    }
}

export function deactivate() {}

function getWebviewContent(keyTypes: string[], keysByType: Map<string, string[]>, records: Record<string, any>[]) {
    const initialType = keyTypes[0];
    keyTypes = ["Select a key"].concat(keyTypes) ;

    return /*html*/ `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <style>
            body { margin:0; padding:0; height:100vh; overflow:hidden; font-family:sans-serif; }
            #container { display:flex; height:100%; width:100%; }

            #leftPane { width:800px; min-width:300px; max-width:1200px; border-right:1px solid #ccc; overflow:auto; padding:5px; box-sizing:border-box; }
            #splitter { width:5px; cursor:col-resize; background: #ddd; }
            #rightPane { flex:1; overflow:auto; padding:10px; box-sizing:border-box; }
            #refreshBtn {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 14px;
            }
            #refreshBtn:hover { background-color: var(--vscode-button-hoverBackground); }
            #keyTypeSelect {
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 13px;
            }
            #leftHeader {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 8px;
                padding: 4px 6px;
                background-color: var(--vscode-sideBar-background);
                border-bottom: 1px solid var(--vscode-editorGroup-border);
                position: sticky ;
                top: 0 ;
                z-index: 10 ;
            }

            table.keyBytes {
                border-collapse: collapse;
                font-family: monospace;
            }

            table.keyBytes td {
                border: 2px solid var(--vscode-editor-hoverHighlightBackground);
                padding: 0px 0px;
                text-align: center;
                font-size: 12px;
                width: 20px;
                height: 20px;
            }

            .keyItem { padding:5px; cursor:pointer; }
            .keyItem:hover { background: var(--vscode-editor-hoverHighlightBackground); }
            .selected { background: var(--vscode-button-background) ; color:white; }

            ul.tree { list-style:none; padding-left:20px; }
            ul.tree li { margin:2px 0; }
            span.toggle { cursor:pointer; display:inline-block; width:16px; }
            span.key { cursor:pointer; }
            span.value[contenteditable="true"]:focus { background: #eef; color: #000; outline:none; }

            select { width:100%; margin-bottom:5px; }
        </style>
    </head>
    <body>
        <div id="container">
            <div id="leftPane">
                <div id="leftHeader">
                    <button id="refreshBtn" title="Recarregar">⟳</button>
                    <select id="keyTypeSelect">
                        ${keyTypes.map(t => `<option value="${t}">${t}</option>`).join("")}
                    </select>
                </div>
                <ul id="keyList"></ul>
            </div>
            <div id="splitter"></div>
            <div id="rightPane"><p>Selecione uma chave para ver os detalhes.</p></div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const leftPane = document.getElementById("leftPane");
            const splitter = document.getElementById("splitter");
            const rightPane = document.getElementById("rightPane");
            const keyTypeSelect = document.getElementById("keyTypeSelect");
            const keyList = document.getElementById("keyList");

            const keysByType = ${JSON.stringify(Object.fromEntries(keysByType))};
            const records = ${JSON.stringify(records)};

            function isPrintable(code) {
                return code >= 32 && code <= 126;
            }

            function renderKeyBytes(str) {
                let html = '<table class="keyBytes"><tr>';
                const bytes = str.split(',');
                for( let i = 0 ; i < bytes.length - 1 ; i++ ){
                    html += '<td>' + bytes[i] + '</td>';
                }
                html += '</tr></table>';
                return html;
            }

            function renderKeys(type) {
                const keys = keysByType[type] || [];
                keyList.innerHTML = keys.map((k, i) => '<li class="keyItem" data-index=\"' + i.toString() + '\">' + renderKeyBytes(k) + '</li>').join("");
                attachKeyEvents();
            }

            function attachKeyEvents() {
                document.querySelectorAll(".keyItem").forEach(el => {
                    el.addEventListener("click", () => {
                        document.querySelectorAll(".selected").forEach(s => s.classList.remove("selected"));
                        el.classList.add("selected");
                        const index = parseInt(el.dataset.index);
                        const record = records[index];
                        rightPane.innerHTML = renderTree(record);
                        attachTreeEvents(rightPane);
                    });
                });
            }

            function renderTree(obj) {
                if (typeof obj !== "object" || obj === null) return '<span>'+obj+'</span>';
                let html = '<ul class="tree">';
                for (const [k,v] of Object.entries(obj)) {
                    const hasChildren = typeof v === 'object' && v !== null;
                    const icon = hasChildren ? '▶' : '';
                    html += '<li>' +
                        (hasChildren ? '<span class="toggle">'+icon+'</span>' : '') +
                        '<span class="key">'+k+':</span> ';
                    if (hasChildren) {
                        html += renderTree(v);
                    } else {
                        html += '<span class="value" contenteditable="true" data-key="'+k+'">'+v+'</span>';
                    }
                    html += '</li>';
                }
                html += '</ul>';
                return html;
            }

            function attachTreeEvents(container) {
                container.querySelectorAll("span.toggle").forEach(t => {
                    t.addEventListener("click", () => {
                        const li = t.parentElement;
                        const childUl = li.querySelector("ul");
                        if (!childUl) return;
                        if (childUl.style.display === 'none') {
                            childUl.style.display = 'block';
                            t.innerText = '▼';
                        } else {
                            childUl.style.display = 'none';
                            t.innerText = '▶';
                        }
                    });
                });

                container.querySelectorAll("span.value").forEach(v => {
                    v.addEventListener("blur", () => {
                        const key = v.dataset.key;
                        const value = v.innerText;
                        console.log("Valor alterado", key, value);
                        // Aqui você poderia enviar a alteração para a extensão
                    });
                });
            }

            // Inicial
            attachKeyEvents();

            keyTypeSelect.addEventListener("change", () => {
                renderKeys(keyTypeSelect.value);
                rightPane.innerHTML = "<p>Selecione uma chave para ver os detalhes.</p>";
            });

            // Splitter para redimensionamento do painel esquerdo
            let isDragging = false;
            splitter.addEventListener('mousedown', e => { isDragging = true; });
            window.addEventListener('mouseup', e => { isDragging = false; });
            window.addEventListener('mousemove', e => {
                if (!isDragging) return;
                const newWidth = e.clientX;
                leftPane.style.width = newWidth + 'px';
            });

            leftPane.addEventListener("scroll",()=>{
                if( leftPane.scrollTop + leftPane.clientHeight >= leftPane.scrollHeight - 10 ){
                    vscode.postMessage({
                        command: "increaseLimit",
                        newLimit: 200 ,
                        keyType: keyTypeSelect.value 
                    });
                }
            });
        </script>
    </body>
    </html>
    `;
}
