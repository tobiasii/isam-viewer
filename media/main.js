
const vscode = acquireVsCodeApi();
const leftPane = document.getElementById("leftPane");
const splitter = document.getElementById("splitter");
const rightContent = document.getElementById("rightContent");
const keyTypeSelect = document.getElementById("keyTypeSelect");
const keyList = document.getElementById("keyList");
const nextPage = document.getElementById("nextBtn");
const prevPage = document.getElementById("prevBtn");
const viewMode = document.getElementById("viewMode");

let limit = 30 ;
let item_index ;
let decoder = new TextDecoder('ascii');
let key_def ;

function isPrintable(code) {
    return code >= 32 && code <= 126;
}

function renderKeyBytes(str) {
    let html = '<table class="keyBytes"><tr>';
    const bytes = str.split(';');
    for( let i = 0 ; i < bytes.length ; i++ ){
        const decoded = bytes[i] !== '00' ? decoder.decode( new Uint8Array([ parseInt(bytes[i],16) ])) : '00' ;
        if( decoded.length > 1 )
            html += '<td class="keyByteItemHex">' + bytes[i] + '</td>';
        else
            html += '<td>' + decoded + '</td>';
    }
    html += '</tr></table>';
    return html;
}

function renderKeys(keys) {
    keyList.innerHTML = keys.map(({value,offset}) => '<li class="keyItem" data-index=\"' + offset.toString() + '\">' + renderKeyBytes(value) + '</li>').join("");
    attachKeyEvents();
}

function renderKeysTypes(keyTypes) {
    keyTypeSelect.innerHTML = keyTypes.map(t=>'<option value=\"' + t + '\">' + t + '</option>');
}

function attachKeyEvents() {
    document.querySelectorAll(".keyItem").forEach(el => {
        el.addEventListener("click", () => {
            document.querySelectorAll(".selected").forEach(s => s.classList.remove("selected"));
            el.classList.add("selected");
            item_index = parseInt(el.dataset.index);
            vscode.postMessage({command:'updateContent', index: item_index, mode: viewMode.value });
        });
    });
}

viewMode.addEventListener("change", () => {
    vscode.postMessage({command:'updateContent', index: item_index, mode: viewMode.value });
});

function renderRightPane(content,key_def) {
    const mode = viewMode.value;
    if (mode === "hex") {
        rightContent.innerHTML = renderHex(content,key_def);
    } else if (mode === "custom1") {
        rightContent.innerHTML = renderTree(content);
    } else if (mode === "custom2") {
        rightContent.innerHTML = renderCustom2(content);
    }
}

function renderHex(content,key_def) {
    const { record , type } = content ;
    const bytes = record.split(';') ;
    const max_lenght = 16 ;
    let html = "<table class='hexTable'><thead><tr>";
    html += "<th>Offset</th>";
    for (let i = 0; i < max_lenght; i++) {
        html += `<th>${i.toString(16).padStart(2,"0").toUpperCase()}</th>`;
    }
    html += "<th>Decoded</th></tr></thead><tbody>";

    for (let i = 0; i < bytes.length ; i += max_lenght) {
        let addr = i.toString(16).padStart(8, "0");
        html += `<tr><td class="hexOffset">${addr}</td>`;

        let ascii = [] ;
        for (let j = 0; j < max_lenght; j++) {
            if ( (i + j) < bytes.length && bytes[i + j] ) {
                const byte = parseInt(bytes[i + j],16) ;
                const byte_offset = i + j ;
                const component_index = key_def.reduce((prev,curr,index)=>{
                    const def_end = parseInt(curr.offset) + parseInt(curr.length) ;
                    if ( byte_offset >= curr.offset && byte_offset < def_end  )
                        return index ;
                    else
                        return prev ;
                }, -1 ) 
                const class_type = component_index != -1 ? ` class="hexTableKey" title="Key Component ${component_index.toString()}"`: '' ;
                html += `<td${class_type}>${byte.toString(16).padStart(2,'0')}</td>`;
                ascii.push(byte) ;
            } else {
                html += "<td></td>";
                ascii.push(0x00);
            }
        }
        html += `<td class="hexAscii">${decoder.decode(new Uint8Array(ascii))}</td></tr>`;
    }

    html += "</tbody></table>";
    return html;
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
        });
    });
}

keyTypeSelect.addEventListener("change", () => {
    rightContent.innerHTML = "<p>Selecione uma chave para ver os detalhes.</p>";
    vscode.postMessage({
        command: "selectedKeyType",
        type: keyTypeSelect.value
    })
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

window.addEventListener('message',event=>{
    const message = event.data;
    switch(message.command){
        case 'updateKeys':
            renderKeys(message.keys);
            break;
        case 'updateContent':
            renderRightPane(message.content,message.key_def);
            break;
        case 'initData':
            renderKeysTypes(message.keyTypes);
            renderKeys(message.keys);
            break;
    }
});

nextPage.addEventListener('click',()=>{
    vscode.postMessage({command: 'next', type: keyTypeSelect.value})
});

prevPage.addEventListener('click',()=>{
    vscode.postMessage({command: 'prev',type: keyTypeSelect.value})
});

window.addEventListener("DOMContentLoaded", () => {
    vscode.postMessage({comand:'init'});
});