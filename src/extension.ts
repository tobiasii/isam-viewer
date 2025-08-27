import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    let mockData = [
        { id: 1, nome: "Cliente A", saldo: 1200 , deleted: false },
        { id: 2, nome: "Cliente B", saldo: 3400 , deleted: false },
        { id: 3, nome: "Cliente C", saldo: -150 , deleted: true  }
    ];

    const disposable = vscode.commands.registerCommand("isamViewer.open", () => {
        const panel = vscode.window.createWebviewPanel(
            "isamViewer",
            "ISAM Viewer",
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
		const keyTypes = ["Primária", "Secundária"];
		const keysByType = {
			"Primária": ["CHAVE_1", "CHAVE_2", "CHAVE_3"],
			"Secundária": ["CHAVE_A", "CHAVE_B", "CHAVE_C"]
		};
		const records = [
			{ id: 1, nome: "Cliente A", saldo: 1200 },
			{ id: 2, nome: "Cliente B", saldo: 3400 },
			{ id: 3, nome: "Cliente C", saldo: -150 , sub : [ 10 , 15 , 16 ] }
		];

		panel.webview.html = getWebviewContent(keyTypes, keysByType, records);

        // Comunicação Webview → Extensão
        panel.webview.onDidReceiveMessage(async (msg) => {
                switch (msg.command) {
					case "changeKey":
						mockData = mockData.map(r => ({ ...r, saldo: r.saldo + 50 }));
						break;

					case "delete":
						mockData = mockData.filter(r => r.id !== msg.id);
						break;

					case "updateCell":
						mockData = mockData.map(r => {
							if (r.id === msg.id) {
								return { ...r, [msg.field]: msg.field === "saldo" ? Number(msg.value) : msg.value };
							}
							return r;
						});
						break;
				}

            // Envia dataset atualizado
            panel.webview.postMessage({ command: "update", data: mockData });
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

function getWebviewContent(keyTypes: string[], keysByType: Record<string, string[]>, records: Record<string, any>[]) {
    const initialType = keyTypes[0];
    const initialKeys = keysByType[initialType] || [];
    const keyItems = initialKeys.map((k, i) => `<li class="keyItem" data-index="${i}">${k}</li>`).join("");

    return /*html*/ `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <style>
            body { margin:0; padding:0; height:100vh; overflow:hidden; font-family:sans-serif; }
            #container { display:flex; height:100%; width:100%; }

            #leftPane { width:200px; min-width:100px; max-width:500px; border-right:1px solid #ccc; overflow:auto; padding:5px; box-sizing:border-box; }
            #splitter { width:5px; cursor:col-resize; background: #ddd; }
            #rightPane { flex:1; overflow:auto; padding:10px; box-sizing:border-box; }

            .keyItem { padding:5px; cursor:pointer; }
            .keyItem:hover { background:#eee; }
            .selected { background: #007acc; color:white; }

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
                <select id="keyTypeSelect">
                    ${keyTypes.map(t => `<option value="${t}">${t}</option>`).join("")}
                </select>
                <ul id="keyList">${keyItems}</ul>
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

            const keysByType = ${JSON.stringify(keysByType)};
            const records = ${JSON.stringify(records)};

            function renderKeys(type) {
                const keys = keysByType[type] || [];
                keyList.innerHTML = keys.map((k, i) => '<li class="keyItem" data-index="'+i+'">'+k+'</li>').join("");
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
        </script>
    </body>
    </html>
    `;
}
