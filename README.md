# tiuvi-editorVideo
First web video editor, using web codecs. This video editor does not use server only client resources. It is very fast compared to ffmpeg wasm for coding tasks.

Demuxer mp4
https://github.com/gpac/mp4box.js

Demuxer webm -> This link does not have a cdn
https://github.com/jscodec/jswebm

Multiplexor mp4
https://github.com/Vanilagy/mp4-muxer

Multiplexor webm
https://github.com/Vanilagy/webm-muxer

I am working here on a valid demo, I am currently making the script compatible in the browser environment and in the worker environment so that I can use it in both ways. 
The demo is broken because my servers now serve the videos in parts and the code is not updated try to upload a video
https://tiuvi.com/videoEditorWebCodecs

You can investigate the files directly in sources, videoStreamWorker.js is the main one to edit the video file
![image](https://github.com/tiuvi/tiuvi-editorVideo/assets/69035383/624566ec-2643-4701-843f-38882618d911)
