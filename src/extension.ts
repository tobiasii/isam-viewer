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

        const htmlPath = path.join(this.context.extensionPath,'media','index.html');
        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css"));

        let html = fs.readFileSync(htmlPath,'utf-8');
		webviewPanel.webview.html = html.replace("{{styleUri}}", styleUri.toString() ) ;        
        
        webviewPanel.webview.onDidReceiveMessage(message =>{
            switch( message.command ){
                case "increaseLimit":
                    outputChannel.appendLine("Novo limit:" + message.newLimit );
                    break;
                case "selectedKeyType":
                    console.log("selectedKeyType");
                    const keys = keysByType.get(message.type)??[];
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : keys ,
                    });
                    break;
                default:
                    webviewPanel.webview.postMessage({ command: 'initData' , keyTypes: keyTypes , keys: keysByType.get(keyTypes[0])??[] , records: records  });
            }
        });
    }
}

export function deactivate() {}