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

        const command = `C:/SIFN/projetos/mf-export-symbols/build/release/Exprcdl.exe`;
        const fileName = path.win32.resolve( document.uri.fsPath );
        const result = spawnSync( command , ["--json", fileName , "--only-key" ] , { encoding: "utf-8" });

        if( result.status != 0 ){
            throw "Error on exec export" ;
        }

		const { key_def } = JSON.parse(result.stdout);
        const keyTypes : string[] = Object.entries(key_def).map(([key_name,def])=>key_name);

        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css"));
        const scriptPath = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
        const htmlPath = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "index.html"));

        const page_size = 24 ;
        let page_num = 0 ;
        let selectedKeyType = keyTypes[0];

        const get_keys = function ( key_name : string , page : number = 0  ) : { key : string , index: Number }[]  {
            const key_id = key_name.split('_')[1]??-1 + 1 ;

            const result_keys = spawnSync(command, ["--json",fileName,"--key",key_id.toString(),"--page",page_num.toString(),"--page-size",page_size.toString()] , { encoding: "utf-8" , maxBuffer: 99999999 });
            try{
                const { keys } = JSON.parse(result_keys.stdout);
                return keys ;
            }catch(e:any){
                vscode.window.showErrorMessage(e.toString());
                return [];
            }
        }

        const get_record = function( offset : number ){
            const result_record = spawnSync(command, ["--json",fileName,"--record-offset", offset.toString()] , { encoding: "utf-8" });
            try{
                const { records } = JSON.parse(result_record.stdout);
                return records[0] ;
            }catch(e:any){
                vscode.window.showErrorMessage(e.toString());
            }
        }

        let html = fs.readFileSync(htmlPath.fsPath,'utf-8');
		webviewPanel.webview.html = html.replace("{{styleUri}}", styleUri.toString() ).replace("{{scriptUri}}", scriptPath.toString() ) ;        
        
        webviewPanel.webview.onDidReceiveMessage(message =>{
            switch( message.command ){
                case "selectedKeyType":
                    selectedKeyType = message.type ;
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : get_keys(selectedKeyType) ,
                        page:  page_num 
                    });
                    break;
                case "updateContent":
                    const new_content = get_record(message.index) ;
                    const def_sel = key_def[selectedKeyType] ;
                    webviewPanel.webview.postMessage({
                        command: 'updateContent',
                        content: new_content,
                        key_def: def_sel
                    })
                    break ;
                case "next": {
                    page_num = page_num + 1 ;
                    const keys = get_keys(selectedKeyType);
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : keys ,
                        page : page_num 
                    });
                    if( keys.length < page_size )
                        page_num = page_num - 1 ;
                    break;
                }
                case "prev":{
                    page_num = page_num > 0 ? page_num - 1 : 0 ;
                    const keys = get_keys(selectedKeyType);
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : keys ,
                        page : page_num 
                    });
                    break;
                }
                case "page":{
                    page_num = message.page ;
                    const keys = get_keys( selectedKeyType );
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : keys ,
                        page : page_num 
                    });
                }
                default:
                    webviewPanel.webview.postMessage({ 
                        command: 'initData' , 
                        keyTypes: keyTypes , 
                        selectedKeyType: selectedKeyType ,
                        keys: get_keys(selectedKeyType),
                        page: page_num 
                    });
            }
        });
    }
}

export function deactivate() {}