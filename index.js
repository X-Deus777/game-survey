const express = require("express")
const axios = require("axios")

const app = express()

app.use(express.static("."))

axios.defaults.timeout = 8000

/* =========================================
   MANUAL OVERRIDES
========================================= */

const OVERRIDES = {

"209120": {
title: "Street Fighter X Tekken"
}

}

/* =========================================
   HELPERS
========================================= */

function uniq(arr){

return [...new Set((arr||[]).filter(Boolean))]

}

function decodeHtml(str){

if(!str) return str

return str
.replace(/&amp;/g,"&")
.replace(/&quot;/g,'"')
.replace(/&#39;/g,"'")
.replace(/&lt;/g,"<")
.replace(/&gt;/g,">")

}

/* =========================================
   STEAM API
========================================= */

async function steamAPI(appid){

console.log(`\n[steamAPI] start ${appid}`)

try{

const res = await axios.get(
`https://store.steampowered.com/api/appdetails?appids=${appid}`,
{
headers:{ "User-Agent":"Mozilla/5.0" }
}
)

const payload = res.data?.[appid]

if(!payload || !payload.success){

console.log(`[steamAPI] failed`)
return null

}

const game = payload.data

let video=null
let hls=null

if(game.movies?.length){

const movie = game.movies[0]

if(movie?.id)
video=`https://cdn.cloudflare.steamstatic.com/steam/apps/${movie.id}/movie480.mp4`

if(movie?.hls_h264)
hls=movie.hls_h264

}

const screenshots=(game.screenshots||[])
.slice(0,12)
.map(x=>x.path_full)

console.log(
`[steamAPI] title="${game.name}" shots=${screenshots.length} video=${!!video}`
)

return{
title:game.name,
video,
hls,
screenshots
}

}catch(e){

console.log(`[steamAPI] error ${e.message}`)

return null

}

}

/* =========================================
   STEAM STORE PAGE
========================================= */

async function steamStorePage(appid){

console.log(`[steamPage] start ${appid}`)

try{

const res = await axios.get(
`https://store.steampowered.com/app/${appid}/?l=english`,
{
headers:{
"User-Agent":"Mozilla/5.0",
"Accept-Language":"en-US,en;q=0.9"
}
}
)

const html=res.data

console.log(`[steamPage] html size ${html.length}`)

let title=null

const m = html.match(/<title>\s*(.*?)\s*on Steam/i)

if(m?.[1]){

title=decodeHtml(m[1].trim())

console.log(`[steamPage] title="${title}"`)

}

const hashes=new Set()

for(const m of html.matchAll(/ss_([a-f0-9]{40})/g))
hashes.add(m[1])

const screenshots=[...hashes]
.slice(0,12)
.map(h=>`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/ss_${h}.1920x1080.jpg`)

console.log(`[steamPage] screenshots=${screenshots.length}`)

return{title,screenshots}

}catch(e){

console.log(`[steamPage] error ${e.message}`)

return{title:null,screenshots:[]}

}

}

/* =========================================
   STEAM COMMUNITY SCREENSHOTS
========================================= */

async function steamCommunityScreens(appid){

console.log(`[community] start ${appid}`)

try{

const url=`https://steamcommunity.com/app/${appid}/screenshots/?p=1&browsefilter=trendyear&view=imagewall`

const res=await axios.get(url,{
headers:{ "User-Agent":"Mozilla/5.0" }
})

const html=res.data

const matches=[
...html.matchAll(/https:\/\/images\.steamusercontent\.com\/ugc\/[^"'<> ]+/g)
]

let shots=matches.map(x=>x[0].split("?")[0])

shots=uniq(shots).slice(0,12)

console.log(`[community] found ${shots.length}`)

return shots

}catch(e){

console.log(`[community] error ${e.message}`)

return[]

}

}

/* =========================================
   DAILYMOTION SEARCH
========================================= */

async function dailymotionVideo(title){

console.log(`[dailymotion] search "${title}"`)

try{

const query=encodeURIComponent(`${title} trailer`)

const url=`https://api.dailymotion.com/videos?search=${query}&limit=1`

console.log(`[dailymotion] request -> ${url}`)

const res=await axios.get(url)

const video=res.data?.list?.[0]

if(!video){

console.log(`[dailymotion] no results`)
return null

}

console.log(`[dailymotion] found id=${video.id}`)

return `https://www.dailymotion.com/embed/video/${video.id}`

}catch(e){

console.log(`[dailymotion] error ${e.message}`)
return null

}

}

/* =========================================
   HEADER FALLBACK
========================================= */

function headerFallback(appid){

console.log(`[fallback] header`)

return[
`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
]

}

/* =========================================
   ROUTE
========================================= */

app.get("/game", async(req,res)=>{

const appid=String(req.query.appid)

console.log(`\n==============================`)
console.log(`[route] appid=${appid}`)

const override=OVERRIDES[appid]

const steam=await steamAPI(appid)
const page=await steamStorePage(appid)

const title=
override?.title ||
steam?.title ||
page?.title ||
`App ${appid}`

console.log(`[route] title="${title}"`)

/* VIDEO */

let video=steam?.video || null
let hls=steam?.hls || null
let embed=null

if(!video){

embed=await dailymotionVideo(title)

}

/* SCREENSHOTS */

let screenshots=[]

if(steam?.screenshots?.length){

screenshots=steam.screenshots
console.log(`[route] shots from steamAPI`)

}
else if(page?.screenshots?.length){

screenshots=page.screenshots
console.log(`[route] shots from steamPage`)

}
else{

screenshots=await steamCommunityScreens(appid)

if(screenshots.length)
console.log(`[route] shots from community`)

}

if(!screenshots.length){

screenshots=headerFallback(appid)

}

console.log(`[route] FINAL shots=${screenshots.length}`)

res.json({
appid,
title,
video,
hls,
embed,
screenshots
})

})

/* ========================================= */

app.listen(3000,()=>{
console.log("server running http://localhost:3000")
})