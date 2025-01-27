'use strict';


console.log("pixi worker: ", pixi);
console.log("pixi worker: ", globalThis["tiuviVideoEditor"]);

const {

    Application, Container, Sprite, Assets,

    DOMAdapter, WebWorkerAdapter,

    Graphics, Rectangle,

    BlurFilter,

    SCALE_MODES,

} = pixi;

if (globalThis["tiuviVideoEditor"].isWorker) {
    console.log("DOMAdapter se ejecuta")
    DOMAdapter.set(WebWorkerAdapter);
}


globalThis["tiuviVideoEditor"]['newCanvas'] = async function (args) {

    const {
        width, height, newWidth, newHeight, cutScreen, waterMark, rotate,
    } = args;

    const canvas = new OffscreenCanvas(width, height);

    const ctx = canvas.getContext('2d');

    const app = new Application();

    await app.init({ width: width, height: height, autoStart: false });

    const container = app.stage;

    const bunny = new pixi.Sprite();
    container.addChild(bunny);

    const texture = pixi.Texture.from(canvas);

    bunny.texture = texture;

    bunny.height = height;
    bunny.width = width;

    bunny.anchor.set(0.5);
    bunny.position.set(app.screen.width / 2, app.screen.height / 2);



    if (waterMark !== null) {

        for (let index = 0; index < waterMark.length; index++) {

            const texture = pixi.Texture.from(waterMark[index].image);

            const bunny = new pixi.Sprite(texture);

            bunny.height = waterMark[index].screenSizeHeight;

            bunny.width = waterMark[index].screenSizeWidth;

            bunny.x = waterMark[index].screenStartWidth; // Posición horizontal (x)

            bunny.y = waterMark[index].screenStartHeight; // Posición vertical (y)

            bunny.alpha = waterMark[index].alpha / 100;

            waterMark[index].bunny = bunny; // Guardar la referencia del bunny en el objeto waterMark

        }


    }


    /*
       // Inner radius of the circle
       const radius = 200;
       // The blur amount
       const blurSize = 32;
       const circle = new Graphics().circle(radius + blurSize, radius + blurSize, radius).fill({ color: 0xff0000 });
       circle.filters = [new BlurFilter({
            strength: 32,  // Fuerza del desenfoque
            quality: 100,   // Calidad del desenfoque
            resolution: 1, // Resolución del desenfoque
            kernelSize: 15  // Tamaño del núcleo del desenfoque
        })];
    
       const bounds = new Rectangle(0, 0, (radius + blurSize) * 2, (radius + blurSize) * 2);
       const textureCircle = app.renderer.generateTexture({
           target: circle,
           style: { scaleMode: "nearest" },
           resolution: 1,
           frame: bounds,
       });
       const focus = new Sprite(textureCircle);
    
       app.stage.addChild(focus);
       bunny.mask = focus;
       focus.position.x = canvas.width / 2 - focus.width / 2;
       focus.position.y = canvas.height / 2 + 100 - focus.height / 2;
*/

    return ({ app, container, bunny, texture, canvasRender: app.canvas, canvasBase: canvas, ctx });




}

globalThis["tiuviVideoEditor"]['editVideo'] = function (args) {


    const {
        canvas, frame, cutScreen, waterMark, rotate,
    } = args;

    const { timeStampReal } = frame;

    const {
        app = null,
        container = null,
        bunny = null,
        texture = null,
        ctx,
        canvasBase,
    } = canvas;

    ctx.drawImage(frame, 0, 0);

    if (waterMark !== null) {

        for (let index = 0; index < waterMark.length; index++) {

            if (timeStampReal >= (waterMark[index].initMs * 1000) && timeStampReal <= (waterMark[index].endMs * 1000)) {

                if (!container.children.includes(waterMark[index].bunny)) {
                    container.addChild(waterMark[index].bunny);
                }

            } else {

                if (container.children.includes(waterMark[index].bunny)) {
                    container.removeChild(waterMark[index].bunny);
                }

            }

        }
    }

    //Actualizamos la textura que es el canvas del frame
    texture.source.update(canvasBase);

    //Actualizamos el render
    app.renderer.render(app.stage);

}


