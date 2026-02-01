
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components', 'ui');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Replace versioned imports
  // Example: "@radix-ui/react-slot@1.1.2" -> "@radix-ui/react-slot"
  content = content.replace(/from "([^"]+)@\d+\.\d+\.\d+"/g, 'from "$1"');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${path.basename(filePath)}`);
  }
}

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    processFile(path.join(dir, file));
  }
});
