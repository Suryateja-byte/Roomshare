const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const targetDividerFiles = ['SplitStayCard.tsx', 'DesktopHeaderSearch.tsx', 'FilterModal.tsx', 'MessagesPageClient.tsx'];

walk(srcDir, (filePath) => {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;

  const fileName = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Eradicating pure black
  if (fileName === 'SearchForm.tsx') {
    content = content.replace(/shadow-\[0_20px_40px_-15px_rgba\(0,0,0,0\.07\)\]/g, 'shadow-ambient');
  }
  content = content.replace(/focus:ring-black\/5/g, 'focus:ring-on-surface/5');

  // 2. Standardizing shadows globally
  const replaceShadow = (target, replacement) => {
      const regex = new RegExp(`(?<![a-zA-Z0-9-])${target}(?![a-zA-Z0-9-])`, 'g');
      content = content.replace(regex, replacement);
  };
  replaceShadow('shadow-sm', 'shadow-ambient-sm');
  replaceShadow('shadow-md', 'shadow-ambient');
  replaceShadow('shadow-lg', 'shadow-ambient');
  replaceShadow('shadow-xl', 'shadow-ambient-lg');
  replaceShadow('shadow-2xl', 'shadow-ghost');

  // 3. Removing structural dividers
  if (targetDividerFiles.includes(fileName)) {
    const dividers = ['divide-x', 'divide-y', 'border-t', 'border-b', 'border-l', 'border-r'];
    dividers.forEach(div => {
      const regex = new RegExp(`(?<![a-zA-Z0-9-])${div}(?![a-zA-Z0-9-])\\s*`, 'g');
      content = content.replace(regex, '');
    });
  }

  // 4. Softening opaque borders
  const opaqueBorders = ['border-stone-200', 'border-amber-200', 'border-red-200', 'border-blue-100', 'border-yellow-200'];
  opaqueBorders.forEach(border => {
    const regex = new RegExp(`(?<![a-zA-Z0-9-])${border}(?![a-zA-Z0-9-])`, 'g');
    content = content.replace(regex, 'border-outline-variant/20');
  });

  // Clean up double spaces if any were introduced inside classNames
  // This is a bit risky but usually fine in TSX if limited to string literals,
  // but let's avoid touching the whole file and just replace ` className=" "` with ` className=""`
  content = content.replace(/ className=" +"/g, ' className=""');
  content = content.replace(/ className=' +'/g, " className=''");

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
});
