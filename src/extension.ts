import * as vscode from "vscode";
import { spawnSync } from "child_process";
import * as fs from 'fs';
import * as path from 'path';

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

        const config = vscode.workspace.getConfiguration('isamViewer');
        const command = config.get<string>('path','');

        if( !fs.existsSync(command)){
            vscode.window.showErrorMessage('Invalid utility executable path');
            return ;
        }

        const fileName = path.resolve( document.uri.fsPath );
        const result = spawnSync( command , ["--json", fileName , "--only-key" ] , { encoding: "utf-8" });

        if( result.status != 0 ){
            throw "Error on exec export" ;
        }

        const recordLayoutFile = path.format({dir: path.dirname(fileName),name: path.parse(fileName).name,ext:'.json'});
        let recordlayout = fs.existsSync(recordLayoutFile) ? JSON.parse(fs.readFileSync(recordLayoutFile,{encoding:'utf-8'})) : undefined ;

		const { key_def } = JSON.parse(result.stdout);
        const keyTypes : string[] = Object.entries(key_def).map(([key_name,def])=>key_name);

        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css"));
        const scriptPath = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
        const codiconUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'codicon.css'));
        const htmlPath = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "index.html"));

        const page_size = 24 ;
        let page_num = 0 ;
        let selectedKeyType = keyTypes[0];
        let selectedViewMode = 'hex';

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

        const parseValue = function( type: string , value : string[] ){
            if( type.includes("COMP-3") )
                return parseComp3ToString( type , value.join('') );
            if( type.includes("COMP-5") )
                return parseInt(swapBytes(value.join('')),16);
            if( type.includes("COMP") )
                return parseInt(value.join(''),16);
            if( type.includes("GROUP") )
                return value.map((v)=>`\\x${v}`).join('');
            else
                return hexToString(type,value.join('')) ;
        }

        const apply_record_layout = function( layout: any , info : any , base_offset : number ) {
            const { record } = info ;
            const start_pos = parseInt(layout.offset) - base_offset ;
            const end_pos = start_pos + parseInt(layout.size);
            const obj : any = !layout.picture.includes("GROUP") || (Object.keys(layout.child??{}).length ) == 0 ? { value: parseValue( layout.picture , record.split(';').slice( start_pos , end_pos ) ) } : {} ;
            obj['component_index'] = key_def[selectedKeyType].reduce((prev:number,curr:any,index:number)=>{
                const def_end = parseInt(curr.offset) + parseInt(curr.length) ;
                if ( start_pos >= curr.offset && end_pos <= def_end  )
                    return index ;
                else
                    return prev ;
            }, undefined ) 
            obj['picture'] = layout.picture ;

            Object.entries(layout.child??{}).forEach(([id,sub_layout])=>{
                if( !id.includes("FILLER") )
                    obj[id] = apply_record_layout(sub_layout,info,base_offset);
            });
            return obj
        };

        const get_record = function( offset : number ){
            const result_record = spawnSync(command, ["--json",fileName,"--record-offset", offset.toString()] , { encoding: "utf-8" });
            try{
                const { records } = JSON.parse(result_record.stdout);
                if( selectedViewMode != 'hex' && recordlayout[selectedViewMode] ){
                    const layout = recordlayout[selectedViewMode] ;
                    const { record } = records[0] ;
                    if( layout.size > record.split(';').length )
                        return { error: "Record layout invalid!" };
                    return { status: record.type , ...apply_record_layout( layout , records[0] , parseInt(layout.offset) ) };
                }else{
                    return records[0] ;
                }
            }catch(e:any){
                vscode.window.showErrorMessage(e.toString());
            }
        }

        const get_viewModes = function(){
            const default_options = [{text:'Hex Mode',value:'hex'}];
            if( recordlayout ){
                const regs = Object.entries(recordlayout).map(([k,v])=>{ return {value:k,text:k} }); ;
                return default_options.concat(regs);
            }
            return default_options ;
        }

        let html = fs.readFileSync(htmlPath.fsPath,'utf-8');
		webviewPanel.webview.html = html.replace("{{styleUri}}", styleUri.toString() )
                                        .replace("{{scriptUri}}", scriptPath.toString() )         
                                        .replace("{{codiconUri}}", codiconUri.toString() ) ;        
        
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
                    page_num = parseInt(message.page) ;
                    const keys = get_keys( selectedKeyType );
                    webviewPanel.webview.postMessage({
                        command: 'updateKeys',
                        keys : keys ,
                        page : page_num 
                    });
                    break;
                }
                case "viewMode":{
                    selectedViewMode = message.viewMode ;
                    break ;
                }
                case "openRLayout":{
                    vscode.window.showOpenDialog({canSelectMany:false,filters:{'Todos':['json']}}).then((uri)=>{
                        if( uri?.at(0)?.fsPath ){
                            const path = uri.at(0)?.fsPath??"" ;
                            const tree : any = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path,{encoding:'utf-8'})) : undefined ;
                            if( tree ){
                                recordlayout = tree                                 
                                webviewPanel.webview.postMessage({command: 'updateViewModes', viewModes: get_viewModes() });
                            }
                        }
                    });
                    break ;
                }
                default:
                    webviewPanel.webview.postMessage({ 
                        command: 'initData' , 
                        keyTypes: keyTypes , 
                        selectedKeyType: selectedKeyType ,
                        keys: get_keys(selectedKeyType),
                        page: page_num ,
                        viewModes: get_viewModes(),
                        selectedViewMode: selectedViewMode
                    });
            }
        });
    }
}

export function deactivate() {}

const digite_occurs_expr = /([\w\d])\((\d+)\)/
function expand_digit_occurs( picture : string ){
    let pic = picture ;
    let match = pic.match(digite_occurs_expr);
    while( match ){
      const char = match[1] ;
      const occurs = parseInt( match[2] ) ;
      pic = pic.replace(digite_occurs_expr, char.repeat(occurs) );
      match = pic.match(digite_occurs_expr);
    }
    return pic ;
}

function insertAt( src : string , char : string , positon : number  ){
	return src.slice(0, positon) + char + src.slice(positon);
}

export function parseComp3ToString( type : string , valueHexStr : string ){
	const value : string = valueHexStr.slice(0,-1) ;
	const signal : string = (valueHexStr.slice(-1) == 'd')? "-" : "+" ;
	let result : string  = signal + value ;
	if(/PIC *.*V.*/.test(type)){
		let mask : string = expand_digit_occurs(type).toUpperCase().replace(/PIC *S*/,'').replaceAll("COMP-3",'') ;
		const mask_neg = mask.split('').reverse().join('');
		let positon_neg = mask_neg.search('V');
		return insertAt( result , ',' , result.length - positon_neg ) ;
	}else{
		return result ;
	}
}

const decoder = new TextDecoder('latin1');
export function hexToString( type : string , valueHexStr : string ){
	let bytes : number[] = [];
	let signal = "" ;
	for(var index = 0 ; index < valueHexStr.length  ; index = index + 2){
		let byte = valueHexStr.slice(index,index+2);
		bytes.push( parseInt(byte,16) );
	}
	if( /PIC *.*S|s.*/.test(type) ){
		const byte = bytes.pop()??0 ;
		bytes.push( byte & (0xff >> 2) );
		signal = ( byte & 0xC0 )?"-":"+";
	}

	const result = `"${signal}${ decoder.decode( new Uint8Array(bytes) )}"` ;
	if(/PIC *S*.*V.*/.test(type)){
		let mask : string = expand_digit_occurs(type).toUpperCase() ;
		let positon = mask.replace(/PIC *S*/,'').search('V');
		return insertAt( result , ',' , positon + 1 + ( signal.length > 0 ? 1 : 0 ) ) ;
	}else{
		return result ;
	}
}

export function swapBytes( valueHexStr : string ){
	let resultHexStr : string = "";
	for(var index = valueHexStr.length - 2 ; index >=  0 ; index = index - 2){
		let byte = valueHexStr.slice(index,index+2);
		resultHexStr += byte ;
	}
	return resultHexStr ;
}