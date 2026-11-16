import { createApp } from './app.js'
const PORT=process.env.PORT||5001
createApp().listen(PORT,process.env.HOST||'127.0.0.1',()=>console.log(`Backend listening on port ${PORT}`))
