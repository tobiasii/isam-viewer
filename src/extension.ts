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

        panel.webview.html = getWebviewContent(mockData);

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

function getWebviewContent(data: any[]): string {
    if (data.length === 0) {
        return "<h3>Nenhum dado encontrado</h3>";
    }

    // Obtém os campos dinamicamente do primeiro registro
    const fields = Object.keys(data[0]);

    // Cabeçalho
    const header = fields.map(f => `<th>${f}</th>`).join("") + "<th>Ações</th>";

    // Linhas da tabela
    const rows = data.map((r) => {
        const cells = fields.map(f => `
            <td contenteditable="true" data-id="${r.id}" data-field="${f}">
                ${r[f]}
            </td>
        `).join("");
        return `
            <tr>
                ${cells}
                <td><button onclick="remove(${r.id})">Remover</button></td>
            </tr>
        `;
    }).join("");

    return /*html*/ `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: sans-serif; padding: 10px; }
            table { border-collapse: collapse; width: 100%; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 5px; text-align: left; }
            button { margin-right: 5px; }
            select { padding: 5px; }

            td[contenteditable="true"] {
                background: inherit;
                outline: none;
                color: inherit;
            }
            td[contenteditable="true"]:focus {
                background: #525151ff;
                color: inherit ; /* fonte preta durante edição */
            }
        </style>
    </head>
    <body>
        <h2>ISAM Viewer</h2>
        <label>Selecionar chave: 
            <select id="keySelect">
                ${fields.map(f => `<option value="${f}">${f}</option>`).join("")}
            </select>
        </label>

        <table>
            <thead>
                <tr>${header}</tr>
            </thead>
            <tbody id="tableBody">${rows}</tbody>
        </table>

        <script>
            const vscode = acquireVsCodeApi();
            const keySelect = document.getElementById("keySelect");
            const tableBody = document.getElementById("tableBody");

            keySelect.addEventListener("change", () => {
                vscode.postMessage({ command: "changeKey", key: keySelect.value });
            });

            function remove(id) {
                vscode.postMessage({ command: "delete", id });
            }

            // captura edição inline
            tableBody.addEventListener("blur", (e) => {
                if (e.target.matches("td[contenteditable]")) {
                    const id = parseInt(e.target.dataset.id);
                    const field = e.target.dataset.field;
                    const newValue = e.target.innerText;
                    vscode.postMessage({
                        command: "updateCell",
                        id,
                        field,
                        value: newValue
                    });
                }
            }, true);

            // atualiza tabela com dataset vindo da extensão
            window.addEventListener("message", (event) => {
                const msg = event.data;
                if (msg.command === "update") {
                    const fields = Object.keys(msg.data[0] || {});
                    const header = fields.map(f => \`<th>\${f}</th>\`).join("") + "<th>Ações</th>";
                    document.querySelector("thead tr").innerHTML = header;

                    tableBody.innerHTML = msg.data.map(r =>
                        \`<tr>\${
                            fields.map(f => \`
                                <td contenteditable="true" data-id="\${r.id}" data-field="\${f}">
                                    \${r[f]}
                                </td>\`
                            ).join("")
                        }
                        <td><button onclick="remove(\${r.id})">Remover</button></td>
                        </tr>\`
                    ).join("");
                }
            });
        </script>
    </body>
    </html>
    `;
}
