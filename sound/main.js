var gameState = {
    ballX: 50,
    ballY: 50,
};
var speedX = 2;
var speedY = 2;
/* 自動で動く */
/* 何も書かなければ動かない */
function update() {
    gameState.ballX += speedX;
    gameState.ballY += speedY;
    // 画面の端に到達したら反対方向へ
    if (gameState.ballX <= 0 || gameState.ballX >= canvas.width) {
        speedX = -speedX;
    }
    if (gameState.ballY <= 0 || gameState.ballY >= canvas.height) {
        speedY = -speedY;
    }
}
/* keyが入力されたときの動き */
document.addEventListener("keydown", function (event) {
    /* 入力しなくても動く */
    // if (event.key === "ArrowUp") {
    //   speedY = -Math.abs(speedY);  // 上に移動
    // }
    // if (event.key === "ArrowDown") {
    //   speedY = Math.abs(speedY);  // 下に移動
    // }
    // if (event.key === "ArrowLeft") {
    //   speedX = -Math.abs(speedX);  // 左に移動
    // }
    // if (event.key === "ArrowRight") {
    //   speedX = Math.abs(speedX);  // 右に移動
    // }
    /* 入力しない限り動かない */
    // 画面の端でない限り動く
      const moveAmount = 10;
      if (event.key === "ArrowUp" && gameState.ballY > 0) {
        gameState.ballY -= moveAmount;
      }
      if (event.key === "ArrowDown" && gameState.ballY < canvas.height) {
        gameState.ballY += moveAmount;
      }
      if (event.key === "ArrowLeft" && gameState.ballX > 0) {
        gameState.ballX -= moveAmount;
      }
      if (event.key === "ArrowRight" && gameState.ballX < canvas.width) {
        gameState.ballX += moveAmount;
      }
});
var canvas = document.getElementById("gameCanvas");
var ctx = canvas.getContext("2d");

/* カーソルに合わせた動き */
canvas.addEventListener("mousemove", function(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  gameState.ballX = x;
  gameState.ballY = y;
});

function draw() {
    ctx.fillStyle = "#000000";
    // 長方形を描画
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#FFFFFF";
    // 円を描画
    ctx.beginPath();
    // ctx.arc(50, 50, 10, 0, Math.PI * 2);
    ctx.arc(gameState.ballX, gameState.ballY, 10, 0, Math.PI * 2);
    ctx.fill();
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const oscillator = audioCtx.createOscillator();
const panNode = audioCtx.createStereoPanner();

canvas.addEventListener("click", initSound);
function initSound() {
	// 発振 -> パン -> 出力 
	oscillator.connect(panNode);
	panNode.connect(audioCtx.destination);

	oscillator.type = "sine";
	oscillator.start();
}

function sound() {
	// Y: 周波数を上下 
	frequency = 440 * Math.pow(2, (gameState.ballY / canvas.height)*-2 + 1);
	oscillator.frequency.value = frequency;

	// X: パンを左右 
	pan = ((gameState.ballX / canvas.width)*2.2 - 1.1);
	panNode.pan.value = pan < -1 ? -1 : pan < 1 ? pan : 1 ;
}

function gameLoop() {
	update();
	draw();
	sound();
	requestAnimationFrame(gameLoop);
}
gameLoop();
