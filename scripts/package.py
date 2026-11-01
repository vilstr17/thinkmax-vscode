"""Package this dependency-free extension as a universal VSIX."""
import json, pathlib, zipfile, xml.etree.ElementTree as ET
root = pathlib.Path(__file__).resolve().parents[1]
p = json.loads((root / 'package.json').read_text())
ns = 'http://schemas.microsoft.com/developer/vsx-schema/2011'
ET.register_namespace('', ns)
def tag(name): return f'{{{ns}}}{name}'
doc = ET.Element(tag('PackageManifest'), {'Version': '2.0.0'})
meta = ET.SubElement(doc, tag('Metadata'))
ET.SubElement(meta, tag('Identity'), {'Language': 'en-US', 'Id': p['name'], 'Version': p['version'], 'Publisher': p['publisher']})
ET.SubElement(meta, tag('DisplayName')).text = p['displayName']
ET.SubElement(meta, tag('Description'), {'{http://www.w3.org/XML/1998/namespace}space': 'preserve'}).text = p['description']
ET.SubElement(meta, tag('Tags')).text = 'puzzles,codex,claude,terminal,brain'
ET.SubElement(meta, tag('Categories')).text = 'Other'
props = ET.SubElement(meta, tag('Properties'))
for key,value in [('Microsoft.VisualStudio.Code.Engine',p['engines']['vscode']),('Microsoft.VisualStudio.Code.ExecutesCode','true')]: ET.SubElement(props,tag('Property'),{'Id':key,'Value':value})
install = ET.SubElement(doc, tag('Installation'))
ET.SubElement(install,tag('InstallationTarget'),{'Id':'Microsoft.VisualStudio.Code'})
ET.SubElement(doc,tag('Dependencies'))
assets = ET.SubElement(doc,tag('Assets'))
for asset,file in [('Microsoft.VisualStudio.Code.Manifest','package.json'),('Microsoft.VisualStudio.Services.Content.Details','README.md'),('Microsoft.VisualStudio.Services.Content.License','LICENSE'),('Microsoft.VisualStudio.Services.Icons.Default',p['icon'])]: ET.SubElement(assets,tag('Asset'),{'Type':asset,'Path':f'extension/{file}','Addressable':'true'})
types = b'<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="" ContentType="text/plain"/></Types>'
output = root.parent / f'thinkmaxx-{p["version"]}.vsix'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('extension.vsixmanifest',ET.tostring(doc,encoding='utf-8',xml_declaration=True))
    z.writestr('[Content_Types].xml',types)
    files = [root/'package.json',root/'README.md',root/'LICENSE',root/'VERIFICATION.md']
    for folder in ['src','media']: files.extend(f for f in (root/folder).rglob('*') if f.is_file())
    for file in files: z.write(file,'extension/'+file.relative_to(root).as_posix())
print(output)
