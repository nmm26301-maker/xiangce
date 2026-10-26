const path=require('node:path');
const modules=process.env.FLIPYEAR_WEBGL_NODE_MODULES||path.resolve(__dirname,'../third_party/webgl/node_modules');
require(path.join(modules,'esbuild')).buildSync({entryPoints:[path.resolve(__dirname,'../third_party/webgl/entry.js')],outfile:path.resolve(__dirname,'../app/src/main/assets/vendor/webgl-book.js'),nodePaths:[modules],bundle:true,minify:true,format:'iife',target:'es2020',legalComments:'inline',banner:{js:'/* turngl Book3D: MIT, Oğuzhan Togay. Three.js 0.180.0: MIT, Three.js authors. Full notices in third_party/webgl and Settings. */'}});
