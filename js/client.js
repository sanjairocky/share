var name, connectedUser, qrcode;

var relayServer = true;
window.initiator = false;

function generateCode() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  for (var i = 0; i < 5; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

function showQR(data) {
  var qrdiv = document.getElementById("qrcode");
  if (qrdiv && data) {
    qrcode = new QRCode(qrdiv, {
      text: "share-" + data,
      width: 128,
      height: 128,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
    setTimeout(() => {
      console.log("displ");
      document.getElementById("qrcode").children[1].style.display = "";
    }, 0.01 * 1000);
  }
}

function scanQR() {
  video = document.createElement("video");

  // Use facingMode: environment to attemt to get the front camera on phones
  navigator.mediaDevices
    .getUserMedia({
      video: {
        facingMode: "environment",
      },
    })
    .then(function (stream) {
      localStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
      video.play();
      requestAnimationFrame(tick);
    });
}

function tick() {
  var canvasElement = document.getElementById("canvas");
  var canvas = canvasElement.getContext("2d");

  completed = false;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.hidden = false;

    canvasElement.height = 480; //video.videoHeight;
    canvasElement.width = 640; //video.videoWidth;
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    var imageData = canvas.getImageData(
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );
    var code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code) {
      if (code.data.startsWith("share-")) {
        console.log(code.data);
        startPeerConnection(code.data.split("share-")[1]);
        canvasElement.hidden = true;
        localStream.getTracks().forEach((track) => {
          track.stop();
        });
        localStream = null;
        video.srcObject = null;
        completed = true;
      }
    }
  }
  if (!completed) requestAnimationFrame(tick);
}

var receivedFiles = [];

// connecting to the signaling server
// change the url to where the sever is hosted

if (!relayServer) {
  var connection = new WebSocket("ws://localhost:8888");
} else {
  var connection = new WebSocket(
    "https://chat-demo-v1.herokuapp.com/socket".replace("http", "ws")
  );
}

connection.onopen = function () {
  console.log("Connected");
  window.pingTime = setInterval(() => {
    console.log("Pinging .....");
    connection.send(
      JSON.stringify({
        type: "ping",
        from: name,
      })
    );
  }, 29 * 1000);
  if (relayServer) {
    console.log("relaying ..........");
    onLogin({ code: generateCode() });
    return;
  }
  // get a code for the user after connecting to the server
  send({ type: "login" });
};

connection.onclose = (e) => {
  console.log("socket closing .................", e);
};

// Handle all messages through this callback
connection.onmessage = function (message) {
  console.log("Got message", message.data);

  var data = JSON.parse(message.data);

  if (relayServer) {
    if (data.to !== name) {
      // console.log("ignoring msg ........");
      return;
    } else if (data.to === name) {
      data.name = data.from;
    }
  }

  switch (data.type) {
    case "login":
      onLogin(data);
      break;
    case "offer":
      onOffer(data.offer, data.name);
      break;
    case "answer":
      onAnswer(data.answer);
      break;
    case "candidate":
      onCandidate(data.candidate);
      break;
    case "leave":
      onLeave();
      break;
    default:
      break;
  }
};

connection.onerror = function (err) {
  console.log("Got error", err);
};

// Alias for sending messages in JSON format
function send(message) {
  if (relayServer) {
    message.from = name;
    message.to = connectedUser;
  } else if (connectedUser) {
    message.name = connectedUser;
  }

  console.log("sending message", JSON.stringify(message));
  connection.send(JSON.stringify(message));
}

async function onLogin(data) {
  name = data.code;
  $("#yourCode").text(name); // show the code to the user
  showQR(name);
  let siz = parseInt(prompt("enter the chunksize 0 to 10",1));
    let chunkSize = undefined;
	if(!isNaN(siz) && siz <=10 && siz >= 1){
		chunkSize = 16000 * siz;
	}
  await new ShareJS({
    localId: name,
    encoded: true,
    channels: 20,
    customFileId: true,
    fileSystem: true,
    // maxParts: 1000,
    // chunkSize: 160000,
     chunkSize ,
  });

  shareJS.onProgress = async (e) => {
    var { peerId, fileId, info, progress, outgoing, incoming } = e;
    $("#file-" + fileId + " .progress-bar")
      .attr("aria-valuenow", progress)
      .css("width", progress + "%");
  };

  shareJS.onFileBegin = (e) => {
    var { peerId, fileInfo, outgoing, incoming } = e;
    console.log(fileInfo);
    fileInfo.forEach((fi) => {
      if (!document.getElementById(`file-${fi.fileId}`)) {
        $("#files-list").append(
          '<div class="col-sm-6 inline" id="file-' +
            fi.fileId +
            '">' +
            '<div class="panel panel-default">' +
            '<div class="panel-heading">' +
            '<h3 class="panel-title dont-break-out">' +
            fi.info.name +
            "</h3>" +
            "</div>" +
            '<div class="panel-body">' +
            "<p> type: <strong>" +
            fi.info.type +
            "</strong><br>size: <strong>" +
            sizeOf(fi.info.size) +
            "</strong></p>" +
            '<div class="progress">' +
            '<div class="progress-bar progress-bar-striped" role="progressbar"' +
            ' aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"' +
            ' style="width: 0%"><span class="sr-only">0% Complete</span></div>' +
            "</div>" +
            '<button  class="btn btn-sm btn-danger btn-remove-file-' +
            fi.fileId +
            '" disabled><span class="glyphicon glyphicon-remove"' +
            'aria-hidden="true"></span> remove</button>' +
            "</div>" +
            "</div>" +
            "</div>"
        );
      }

      if (incoming) {
        $(".btn-remove-file-" + fi.fileId)
          .removeClass("btn-danger")
          .addClass("btn-warning")
          .attr("onclick", "")
          .attr("disabled", "disabled")
          .text("receiving");
      }

      if (outgoing) {
        $(".btn-remove-file-" + fi.fileId)
          .removeClass("btn-danger")
          .addClass("btn-warning")
          .attr("onclick", "")
          .attr("disabled", "disabled")
          .text("sending");
      }
    });
  };
  shareJS.onFileComplete = (e) => {
    var { peerId, fileId, save, info, deleteFile, outgoing, incoming } = e;

    if (incoming) {
      $(".btn-remove-file-" + fileId)
        .removeClass("btn-warning")
        .addClass("btn-success")
        .removeAttr("disabled")
        .text("download (received)");
      document.getElementsByClassName(
        "btn-remove-file-" + fileId
      )[0].onclick = () => {
        save();
        deleteFile();
        removeFile(fileId);
        // $("#file-" + fileId).remove();
      };
    }

    if (outgoing) {
      $(".btn-remove-file-" + fileId)
        .removeClass("btn-warning")
        .addClass("btn-success")
        .removeAttr("disabled")
        .text("remove (sent)");
      document.getElementsByClassName(
        "btn-remove-file-" + fileId
      )[0].onclick = () => {
        deleteFile();
        removeFile(fileId);
        // $("#file-" + fileId).remove();
      };
    }
  };

  shareJS.onFileFailed = (e) => {
    var { peerId, fileId, info, outgoing, incoming } = e;

    $(".btn-remove-file-" + fileId)
      .removeClass("btn-warning")
      .addClass("btn-danger")
      .attr("onclick", "")
      .text("failed");
  };
  startConnection();
}

var yourConnection,
  cs,
  connectedUser,
  dataChannel,
  currentFile,
  currentFileSize,
  currentFileMeta;

function startConnection() {
  if (hasRTCPeerConnection()) {
    setupPeerConnection();
  } else {
    alert("Sorry, your browser does not support WebRTC.");
  }
}

function setupPeerConnection() {
  receivedFiles = [];
  var configuration = {
    // iceTransportPolicy: "relay",
    iceServers: [
      {
        url: "stun:stun.l.google.com:19302",
      },

      {
        urls: ["turn:numb.viagenie.ca?transport=tcp"],
        username: "normanarguet@gmail.com",
        credential: "1ceCre4m007",
      },
    ],
  };
  yourConnection = new RTCPeerConnection(configuration, { optional: [] });

  // Setup ice handling
  yourConnection.onicecandidate = function (event) {
    if (event.candidate) {
      send({
        type: "candidate",
        candidate: event.candidate,
      });
    }
  };

  yourConnection.onclose = function (params) {
    console.log("closing connection with " + connectedUser);
  };

  yourConnection.onconnectionstatechange = function (e) {
    if (yourConnection.connectionState === "connected") {
      shareJS.addPeer(yourConnection, connectedUser);
      shareJS.connect(connectedUser, { initiator: window.initiator });
    } else if (yourConnection.connectionState === "disconnected") {
      shareJS.removePeer(connectedUser);
    }
  };

  openDataChannel();
}

function openDataChannel() {
  var dataChannelOptions = {
    ordered: true,
    reliable: true,
    negotiated: true,
    // id: "myChannel",
    id: 99,
  };
  dataChannel = yourConnection.createDataChannel("myLabel", dataChannelOptions);

  cs = [];
  var dcL = 4;

  // yourConnection.ondatachannel = function (e) {
  //   var channel = e.channel;
  //   console.log("on data channel ", channel);
  //   channel.onmessage = onMessage;
  // };
  // dataChannel.onerror = function (error) {
  //   console.log("Data Channel Error:", error);
  // };

  dataChannel.onmessage = onMessage;

  dataChannel.onopen = function (e) {
    console.log(e.type);
    $("#btn-disconnect").removeAttr("disabled");

    console.log("connected ---  with : " + connectedUser);

    $("#btn-connect")
      .attr("disabled", "disabled")
      .removeClass("btn-default")
      .addClass("btn-success")
      .text("Connected to " + connectedUser);

    $("#otherDeviceCode").addClass("hidden");
    $("#scan").addClass("hidden");

    $("#otherDeviceCode").val("").attr("disabled", "disabled");
    $("#files-box").removeClass("hidden");
  };

  dataChannel.onclosing = (e) => {
    console.log(e.type);
  };
  dataChannel.onclose = function (e) {
    console.log(e.type);
    $("#btn-disconnect").attr("disabled", "disabled");
    console.log("(dis) connected ---  with : " + connectedUser);

    $("#btn-connect")
      .removeAttr("disabled")
      .addClass("btn-default")
      .removeClass("btn-success")
      .text("Connect");

    $("#otherDeviceCode").removeClass("hidden");
    $("#scan").removeClass("hidden");

    $("#otherDeviceCode").val("").removeAttr("disabled");

    $("#files-box").addClass("hidden");
  };

  for (var i = 0; i < dcL; i++) {
    dataChannelOptions.id = dataChannelOptions.id + 1;
    var temp = yourConnection.createDataChannel("cs" + 1, dataChannelOptions);
    temp.onmessage = onMessage;
    temp.onclose = () => {};
    cs.push(temp);
  }
}
function onMessage(event) {
  try {
    var message = JSON.parse(event.data);
    console.log(message.type);
    if (!message.type) {
      console.log("malformed message");
      return;
    }

    switch (message.type) {
      case "start":
        currentFile = [];
        currentFileSize = 0;
        currentFileMeta = message.data;
        window.start = performance.now();
        console.log(message.data);
        console.log("Receiving file", currentFileMeta.name);
        break;
      case "end":
        if (currentFile.length === 0 || currentFileSize === 0) {
          console.log("empty file : " + currentFileMeta.name);
          return;
        }
        setTimeout(() => {
          window.end = performance.now();
          if (currentFileSize === currentFileMeta.size) {
            console.log(currentFileMeta.name + " file received sucessfully");
            showFile(currentFileMeta, currentFile);
          }
        }, 5 * 1000);

        break;
      case "failed":
        console.error("failed");
        currentFile = [];
        currentFileSize = 0;
        currentFileMeta = {};
        break;
      case "payload":
        if (!!message.payload) {
          console.log("adding payload");
          currentFile.push(atob(message.payload));

          currentFileSize += currentFile[currentFile.length - 1].length;

          var percentage = Math.floor(
            (currentFileSize / currentFileMeta.size) * 100
          );

          console.log(currentFileMeta.name, percentage);
        }
        break;
    }
  } catch (e) {
    console.error("error wile getting data");
  }
}

function downloadFile(name) {
  if (name && receivedFiles[name]) {
    console.log(
      "time taken to download : " +
        receivedFiles[name].meta.name +
        " -- " +
        receivedFiles[name].time
    );
    saveFile(receivedFiles[name].meta, receivedFiles[name].file);
  }
}

function showFile(currentFileMeta, currentFile) {
  var id = new Date().getTime();
  receivedFiles[id] = {
    meta: currentFileMeta,
    file: currentFile,
    time: `${(window.end - window.start) / (1 * 1000)} seconds`,
  };

  $(".btn-start-send").removeClass("hidden");

  $("#files-list").append(
    '<div class="col-sm-6 inline" id="file-' +
      currentFileMeta +
      '">' +
      '<div class="panel panel-default">' +
      '<div class="panel-heading">' +
      '<h3 class="panel-title dont-break-out">' +
      currentFileMeta.name +
      "</h3>" +
      "</div>" +
      '<div class="panel-body">' +
      "<p> type: <strong>" +
      currentFileMeta.type +
      "</strong><br>size: <strong>" +
      sizeOf(currentFileMeta.size) +
      "</strong></p>" +
      '<div class="progress">' +
      '<div class="progress-bar progress-bar-striped" role="progressbar"' +
      ' aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"' +
      ' style="width: 100%"><span class="sr-only">0% Complete</span></div>' +
      "</div>" +
      '<button onclick="downloadFile(' +
      id +
      ' );" class="btn btn-sm btn-success btn-remove-file-' +
      (files.length - 1) +
      '">' +
      // '<span class="glyphicon glyphicon-remove"' +
      // 'aria-hidden="true"></span>' +
      " download</button>" +
      "</div>" +
      "</div>" +
      "</div>"
  );
}
// Alias for sending messages in JSON format
function dataChannelSend(message) {
  dataChannel.send(JSON.stringify(message));
}

function saveFile(meta, data) {
  var blob = base64ToBlob(data, meta.type);
  saveAs(blob, meta.name);
}

function hasUserMedia() {
  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;
  return !!navigator.getUserMedia;
}

function hasRTCPeerConnection() {
  window.RTCPeerConnection =
    window.RTCPeerConnection ||
    window.webkitRTCPeerConnection ||
    window.mozRTCPeerConnection;
  window.RTCSessionDescription =
    window.RTCSessionDescription ||
    window.webkitRTCSessionDescription ||
    window.mozRTCSessionDescription;
  window.RTCIceCandidate =
    window.RTCIceCandidate ||
    window.webkitRTCIceCandidate ||
    window.mozRTCIceCandidate;
  return !!window.RTCPeerConnection;
}

function hasFileApi() {
  return window.File && window.FileReader && window.FileList && window.Blob;
}

function startPeerConnection(user) {
  connectedUser = user;

  window.initiator = true;

  if (yourConnection.connectionState === "failed") {
    setupPeerConnection();
  }

  // Begin the offer
  yourConnection.createOffer(
    function (offer) {
      send({
        type: "offer",
        offer: offer,
      });
      yourConnection.setLocalDescription(offer);
    },
    function (error) {
      alert("An error has occurred.");
    }
  );
}

function closePeerConnection() {
  if (connectedUser) send({ type: "leave" });
  onLeave();
}

function onOffer(offer, name) {
  connectedUser = name;
  yourConnection.setRemoteDescription(new RTCSessionDescription(offer));

  yourConnection.createAnswer(
    function (answer) {
      yourConnection.setLocalDescription(answer);

      send({
        type: "answer",
        answer: answer,
      });
    },
    function (error) {
      alert("An error has occurred");
    }
  );
}

function onAnswer(answer) {
  yourConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

function onCandidate(candidate) {
  yourConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

function onLeave() {
  if (connectedUser) shareJS.removePeer(connectedUser);
  dataChannel.close();
  yourConnection.close();
  connectedUser = null;
  yourConnection.onicecandidate = null;
  setupPeerConnection();
}

function arrayBufferToBase64(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBlob(b64Data, contentType) {
  contentType = contentType || "";

  var byteArrays = [],
    byteNumbers,
    slice;

  for (var i = 0; i < b64Data.length; i++) {
    slice = b64Data[i];

    byteNumbers = new Array(slice.length);
    for (var n = 0; n < slice.length; n++) {
      byteNumbers[n] = slice.charCodeAt(n);
    }

    var byteArray = new Uint8Array(byteNumbers);

    byteArrays.push(byteArray);
  }

  var blob = new Blob(byteArrays, { type: contentType });
  return blob;
}

var CHUNK_MAX = 160000; // choosing a larger size makes the process faster but it depends on the network
function sendFile(file, fileId) {
  var reader = new FileReader();
  var div = file.size / 20;
  console.log("part size : " + div);

  reader.onloadend = function (evt) {
    if (evt.target.readyState == FileReader.DONE) {
      var buffer = reader.result,
        start = 0,
        end = 0,
        last = false;
      var chunks = [];
      var c1 = cs[0];
      var c2 = cs[1];
      var c3 = cs[2];
      var c4 = cs[3];
      window.multiDC = false;

      try {
        function sendChunk() {
          end = start + CHUNK_MAX;

          if (end > file.size) {
            end = file.size;
            last = true;
          }

          var percentage = Math.floor((end / file.size) * 100);
          $("#file-" + fileId + " .progress-bar")
            .attr("aria-valuenow", percentage)
            .css("width", percentage + "%");

          if (!(c1.bufferedAmount >= div) && window.multiDC) {
            c1.send(
              JSON.stringify({
                type: "payload",
                payload: arrayBufferToBase64(buffer.slice(start, end)),
              })
            );
          } else if (!(c2.bufferedAmount >= div) && window.multiDC) {
            c2.send(
              JSON.stringify({
                type: "payload",
                payload: arrayBufferToBase64(buffer.slice(start, end)),
              })
            );
          } else if (!(c3.bufferedAmount >= div) && window.multiDC) {
            c3.send(
              JSON.stringify({
                type: "payload",
                payload: arrayBufferToBase64(buffer.slice(start, end)),
              })
            );
          } else if (!(c4.bufferedAmount >= div) && window.multiDC) {
            c4.send(
              JSON.stringify({
                type: "payload",
                payload: arrayBufferToBase64(buffer.slice(start, end)),
              })
            );
          } else {
            dataChannel.send(
              JSON.stringify({
                type: "payload",
                payload: arrayBufferToBase64(buffer.slice(start, end)),
              })
            );
            setTimeout(() => {}, 0.25 * 100);
          }

          // if (end > div) {
          //   setTimeout(() => {
          //     console.log("idle...................................");
          //   }, 5 * 100);
          // }

          // If this is the last chunk send our end message, otherwise keep sending
          if (last === true) {
            console.log("sending file completed", file, fileId);
            dataChannelSend({
              type: "end",
            });
            startSending(); // send the next file if available
            $(".btn-remove-file-" + fileId)
              .removeClass("btn-warning")
              .addClass("btn-success")
              .attr("onclick", "")
              .attr("disabled", "disabled")
              .text("success");
          } else {
            start = end;
            // Throttle the sending to avoid flooding
            setTimeout(function () {
              sendChunk();
            }, 0.25 * 100); // this slows the file transfer significantly
          }
        }

        sendChunk();
      } catch (e) {
        $(".btn-remove-file-" + fileId)
          .removeClass("btn-warning")
          .addClass("btn-danger")
          .attr("onclick", "sendFile(" + file + ", " + fileId + ");")
          // .attr("disabled", "")
          // .removeAttr("disabled")
          // .text("retry");
          .text("failed");
        dataChannelSend({
          type: "failed",
        });

        throw new Error(
          JSON.stringify({
            reason: "failed",
            fileId: fileId,
          })
        );
      }
    }
  };

  // this loads the whole file into memory
  // not good for large files
  reader.readAsArrayBuffer(file);
}
