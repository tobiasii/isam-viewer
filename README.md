# ISAM Viewer – VS Code Extension

Uma extensão do **Visual Studio Code** que fornece um **Custom Editor** para arquivos **ISAM**, permitindo:

- **Visualização em Hexadecimal**: abra e inspecione o conteúdo bruto em modo hex.
- **Visualização em Árvore**: caso exista um arquivo JSON descrevendo a estrutura do registro, é possível ver os dados em um formato hierárquico amigável.

---

## 📸 Preview

<!-- Substitua o caminho abaixo pelo arquivo real da imagem que você vai adicionar -->
![Preview do ISAM Viewer](images/preview.png)

---

## 🛠️ Uso

1. Abra um arquivo **.isam** no VS Code.
2. O ISAM Viewer será usado automaticamente como **Custom Editor**.
3. Por padrão, o conteúdo será exibido em **Hex**.

### Exibição em Árvore

- Crie um arquivo JSON que descreva a estrutura do registro.
- Salve esse arquivo no mesmo diretório do arquivo `.isam`, com o mesmo nome-base.  
  Por exemplo:

- Quando o JSON estiver presente, a extensão mostrará automaticamente uma aba “Árvore” com a representação dos campos.

---

## 🧩 Exemplo de Arquivo de Estrutura (JSON)

<!-- Substitua este bloco pelo seu exemplo real -->
```json
{
"nomeRegistro": "Cliente",
"campos": [
  { "nome": "id", "tipo": "int", "offset": 0, "tamanho": 4 },
  { "nome": "nome", "tipo": "string", "offset": 4, "tamanho": 50 },
  { "nome": "idade", "tipo": "int", "offset": 54, "tamanho": 2 }
]
}

