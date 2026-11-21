import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {imagePixels} from '../pwa-icons.mjs';

test('inspect app icon edge colors and alpha for white padding diagnosis', async () => {
  const img = imagePixels(await readFile(new URL('../../assets/droply-icon.png',import.meta.url)));
  const {width:w,height:h,image} = img;
  const px=(x,y)=>[...image.subarray((y*w+x)*4,(y*w+x)*4+4)];
  const points=[[0,0],[1,1],[w-1,0],[0,h-1],[w-1,h-1],[Math.round(w/2),0],
    [0,Math.round(h/2)],[w-1,Math.round(h/2)],[Math.round(w/2),h-1],
    [Math.round(w*.1),Math.round(h*.1)],[Math.round(w*.25),Math.round(h*.25)],
    [Math.round(w*.5),Math.round(h*.5)],[Math.round(w*.75),Math.round(h*.75)]];
  const samples=points.map(([x,y])=>({x,y,pixel:px(x,y)}));
  let white=0,transparent=0,dark=0,transparentEdge=0,whiteEdge=0;
  const hist={};
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=image[i],g=image[i+1],b=image[i+2],a=image[i+3];
    if(a<20)transparent++;
    if(a>240&&r>240&&g>240&&b>240)white++;
    if(a>240 && r<70&&g<90&&b<120)dark++;
    if(x<5||x>=w-5||y<5||y>=h-5){
       if(a<20)transparentEdge++;
       if(a>240&&r>240&&g>240&&b>240)whiteEdge++;
    }
    if((x===0||x===w-1||y===0||y===h-1) && a>128){
       const k=[Math.floor(r/32),Math.floor(g/32),Math.floor(b/32),Math.floor(a/32)].join('-');
       hist[k]=(hist[k]||0)+1;
    }
  }
  const rows=[0,1,3,8,16,24,32,48,64,96].filter(y=>y<h).map(y=>{
    let white=0,alpha0=0,other=0;for(let x=0;x<w;x++){const [r,g,b,a]=px(x,y);if(a<20)alpha0++;else if(a>240&&r>240&&g>240&&b>240)white++;else other++;}
    return {y,white,alpha0,other};
  });
  console.log('DROPLY_ICON_DIAGNOSIS '+JSON.stringify({w,h,samples,white,transparent,dark,transparentEdge,whiteEdge,edgePalette:Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,9),rows}));
});
