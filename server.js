"use strict";

var express = require("express");
var url = require("url");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var formidable = require('formidable');
var jimp = require('jimp');

createAndReaddirSync("./temp");
createAndReaddirSync("./fastupload");

var mm = require("musicmetadata");
var cookieParser = require('cookie-parser');

var config = require("./config.json");
var langs = {};

var port = config.app_port;

fs.readdirSync("./lang").forEach(file => {
    if (path.extname(file) === ".json") {
        langs[path.basename(file, ".json")] = require("./lang/" + file);
    }
});

var clients = {};
var clientsDB = require("./users.json");
var loginTries = {};

var playlists = {};

function saveUsers() {
    fs.writeFileSync("./users.json", JSON.stringify(clientsDB, null, "\t"));
}

var app = express();
app.use(cookieParser());

app.get("/", function (req, res, next) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.sendFile(__dirname + "/audy/login.html");
        return;
    }

    next();
});

app.use("/", express.static(__dirname + "/audy"));

var lib = {};

function savePlaylist(name, user) {
    if (playlists[user] == undefined || playlists[user][name] == undefined) {
        return;
    }

    fs.writeFileSync("./playlists/" + user + "/" + name + ".json", JSON.stringify(playlists[user][name]), {
        encoding: "utf-8"
    });
}

function checkSession(hash, ip) {
    if (hash == null || hash == undefined) {
        return false;
    }

    if (clients[hash] == undefined) {
        return false;
    }

    if (config.iplogging && clients[hash].ip !== ip) {
        return false;
    }

    return true;
}

function logTry(ip) {
    if (config.login_tries_to_ban == 0) {
        return;
    }

    if (loginTries[ip] == undefined) {
        loginTries[ip] = [];
    } else {
        for (let i in loginTries[ip]) {
            if (Date.now() >= loginTries[ip][i] + (1000 * config.login_tries_ban_time * 60)) {
                loginTries[ip].splice(i, 1);
            }
        }
    }

    loginTries[ip].push(Date.now());
}

function isRoot(user) {
    return user === config.root_user;
}

function createAndReaddirSync(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    } else {
        if (!fs.statSync(path).isDirectory()) {
            fs.mkdirSync(path);
        }
    }

    return fs.readdirSync(path);
}

console.log("Loading music data...");
var music = createAndReaddirSync("./music");

music.sort(function (a, b) {
    return fs.statSync("./music/" + a).mtime.getTime() -
        fs.statSync("./music/" + b).mtime.getTime();
});

music.forEach(file => {
    var stat = fs.statSync("./music/" + file);

    if (stat.isDirectory() && fs.existsSync("./music/" + file + "/song.json")) {
        let plInfo = require("./music/" + file + "/song.json");
        lib[file] = {
            name: plInfo.name,
            lyrics: plInfo.lyrics,
            has_picture: plInfo.has_picture
        };
    }
});
console.log("Music data successfully loaded. Found " + Object.keys(lib).length + " tracks.");

createAndReaddirSync("./playlists");
for (let user in clientsDB) {
    playlists[user] = {};

    if (!fs.existsSync("./playlists/" + user)) {
        fs.mkdirSync("./playlists/" + user);
    }

    if (!fs.existsSync("./playlists/" + user + "/all.json")) {
        console.log("Default playlist file of user " + user + " is missing! Generating a new one...");
        playlists[user].all = {
            name: langs[clientsDB[user].lang].default_playlist_name,
            songs: []
        };

        for (var i in lib) {
            playlists[user].all.songs.splice(0, 0, i);
        }

        savePlaylist("all", user);
    }

    fs.readdirSync("./playlists/" + user).forEach(file => {
        var stat = fs.statSync("./playlists/" + user + "/" + file);

        if (stat.isFile() && path.extname(file) === ".json") {
            var json = JSON.parse(fs.readFileSync("./playlists/" + user + "/" + file));
            if (json["name"] != undefined && json["songs"] != undefined) {
                let removed = [];
                for (let i in json.songs) {
                    if (lib[json.songs[i]] == undefined) {
                        removed.push(json.songs[i]);
                    }
                }

                for (let i in removed) {
                    let index = json.songs.indexOf(removed[i]);
                    if (index >= 0) {
                        json.songs.splice(index, 1);
                    }
                }

                let pl = path.basename(file, ".json");

                playlists[user][pl] = json;
                savePlaylist(pl, user);
            }
        }
    });
}

fs.readdirSync("./playlists").forEach(file => {
    var stat = fs.statSync("./playlists/" + file);

    if (stat.isDirectory()) {
        if (clientsDB[file] == undefined) {
            dirClear("./playlists/" + file);
        }
    }
});

var stream;
app.get("/track/:trackID", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    try {
        var musicPath = "./music/" + req.params.trackID + "/song";
        var fileSize = fs.existsSync(musicPath) ? fs.statSync(musicPath).size : 0;

        if (fileSize == 0) {
            throw "error_track_not_found";
        }

        //math sparsed data
        var rangeInfo = req.headers ? req.headers.range : false;
        var bytesRange = {
            from: 0,
            to: fileSize,
            total: fileSize
        };

        if (rangeInfo) {
            let hIndex = rangeInfo.indexOf("bytes=");
            if (hIndex >= 0) {
                let ranges = rangeInfo.substr(hIndex + 6).split("-");
                bytesRange.from = parseInt(ranges[0]);

                if (ranges[1] && ranges[1].length) {
                    let to = parseInt(ranges[1]);
                    bytesRange.to = to < 16 ? 16 : to;
                }
            }
        }

        if (bytesRange.to == fileSize) {
            bytesRange.to--;
        }

        stream = fs.createReadStream(musicPath, {
            start: bytesRange.from,
            end: bytesRange.to,
            bufferSize: 256
        });

        var close = function () {
            stream.close();
        }

        res.on("finish", close);
        res.on("end", close);
        res.on("close", close);

        var headers = {
            "Content-Type": "audio/mp3",
            "Content-Length": bytesRange["to"],
            'Access-Control-Allow-Origin': req.headers.origin || "*",
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'POST, GET, OPTIONS'
        };

        if (bytesRange["total"]) {
            headers["Content-Range"] = "bytes " + bytesRange["from"] + "-" + bytesRange["to"] + "/" + fileSize;
            headers["Content-Length"] = bytesRange["total"];

            res.writeHead(206, headers);
        } else {
            res.writeHead(200, headers);
        }

        stream.pipe(res);
    } catch (e) {
        res.statusCode = 400;
        return res.end("error: " + e);
    }
});

app.post("/upload", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;
    if (!config.low_user_upload_allowed && !isRoot(user)) {
        res.send("upload_not_allowed");
        return;
    }

    var form = new formidable.IncomingForm();
    form.maxFileSize = 1024 * 1024 * 1024;
    form.hash = 'md5';
    form.multiples = true;
    form.encoding = 'utf-8';
    form.uploadDir = './temp';

    form.parse(req, function (err, fields, files) {
        if (err) {
            console.log(err);
            res.send("error_parsing_form");
            return;
        }

        var result = [];
        var resultPromises = [];

        for (var i in files) {
            var file = files[i];
            let hash = file.hash;

            if (hash == null) {
                result.push({
                    error: "error_getting_hash"
                });

                fs.unlinkSync(file.path);
                continue;
            } else {
                if (fs.existsSync("./music/" + hash) && fs.statSync("./music/" + hash).isDirectory()) {
                    result.push({
                        error: "error_song_already_exists"
                    });

                    fs.unlinkSync(file.path);
                    continue;
                } else {
                    fs.mkdirSync("./music/" + hash);
                    fs.writeFileSync("./music/" + hash + "/song", fs.readFileSync(file.path));

                    let info = {
                        name: file.name,
                        lyrics: "",
                        md5: hash,
                        has_picture: false,
                        timestamp: Date.now(),
                        type: file.type
                    };

                    let songID3Stream = fs.createReadStream(file.path);

                    resultPromises.push(new Promise(function (resolve, reject) {
                        mm(songID3Stream, function (err, meta) {
                            songID3Stream.close();

                            lib[hash] = {
                                name: info.name,
                                lyrics: "",
                                has_picture: false
                            };

                            for (let user in clientsDB) {
                                playlists[user].all.songs.splice(0, 0, hash);
                            }

                            if (!err && meta.picture.length > 0) {
                                let jimpError = false;

                                jimp.read(meta.picture[0].data).then(image => {
                                    let w = image.getWidth();
                                    let h = image.getHeight();

                                    if (w > 1024 && h > 1024) {
                                        image.resize(1024, 1024).quality(80);
                                    }

                                    image.write("./music/" + hash + "/picture.jpg");
                                    info.has_picture = lib[hash].has_picture = true;

                                    fs.appendFileSync("./music/" + hash + "/song.json", JSON.stringify(info), {
                                        encoding: "utf-8"
                                    });

                                    result.push(info);
                                    resolve();

                                    return image;
                                }).catch(err => {
                                    console.log("Error while compressing song " + hash + " image. [" + err + "]");
                                    jimpError = true;
                                });

                                if (!jimpError) {
                                    return;
                                }
                            }

                            fs.appendFileSync("./music/" + hash + "/song.json", JSON.stringify(info), {
                                encoding: "utf-8"
                            });

                            result.push(info);
                            resolve();
                        });
                    }));

                    fs.unlinkSync(file.path);
                }
            }
        }

        if (resultPromises.length > 0) {
            Promise.all(resultPromises).then(function () {
                res.send(JSON.stringify(result));

                for (let user in clientsDB) {
                    savePlaylist("all", user);
                }
            }).catch(function (error) {
                for (var i in files) {
                    dirClear("./music/" + files[i].hash);

                    for (let user in clientsDB) {
                        let index = playlists[user].all.songs.indexOf(files[i].hash);

                        if (index >= 0) {
                            playlists[user].all.songs.splice(index, 1);
                        }
                    }

                    delete lib[files[i].hash];
                }

                console.log(error);
                res.send("error");
            });
        } else {
            for (let user in clientsDB) {
                savePlaylist("all", user);
            }

            res.send(JSON.stringify(result));
        }
    });
});

app.get("/timg/:track", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let track = req.params.track;

    if (lib[track] == undefined || lib[track] == null) {
        res.send("error_no_track");
        return;
    }

    if (!lib[track].has_picture) {
        res.send("error_no_picture");
        return;
    }

    if (fs.existsSync("./music/" + track + "/picture.jpg") && fs.statSync("./music/" + track + "/picture.jpg").isFile()) {
        res.sendFile(__dirname+"/music/" + track + "/picture.jpg");
    } else {
        res.send("error_no_picture");
    }
});

app.post("/getjson/:file", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        if (req.params.file === "lang") {
            res.send(JSON.stringify(langs[config.default_lang]));
        } else {
            res.send("error_no_logon");
        }

        return;
    }

    let user = clients[session_hash].login;

    let minConfig = {
        lang: clientsDB[user].lang,
        autoplay: clientsDB[user].autoplay,
        session_time: config.session_time,
        upload_allowed: isRoot(user) || config.low_user_upload_allowed,
        edit_tracks_allowed: isRoot(user) || config.low_user_edit_tracks_allowed,
        title_trackname: clientsDB[user].title_trackname,
        is_root: isRoot(user),
        max_playlists: config.low_user_max_playlists
    };

    switch (req.params.file) {
        case "config":
            res.send(JSON.stringify(minConfig));
            break;
        case "lib":
            res.send(JSON.stringify(lib));
            break;
        case "playlists":
            res.send(JSON.stringify(playlists[user]));
            break;
        case "loadpack":
            let result = {
                config: minConfig,
                lib: lib,
                playlists: playlists[user]
            };

            res.send(JSON.stringify(result));
            break;
        case "lang":
            res.send(JSON.stringify(langs[clientsDB[user].lang]));
            break;
        case "users":
            if (!isRoot(user)) {
                res.send("error_not_allowed");
                return;
            }

            let minUsers = {};

            for (let i in clientsDB) {
                minUsers[i] = {};

                for (let j in clientsDB[i]) {
                    if (j === "password") {
                        continue;
                    }

                    minUsers[i][j] = clientsDB[i][j];
                }
            }

            res.send(JSON.stringify(minUsers));
            break;
        default:
            res.send("error");
            break;
    }
});

app.post("/setconfig", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields) {
        if (err) {
            console.log(err);
            res.send("error_parsing_form");
            return;
        }

        let newConfig = JSON.parse(fields.newConfig);

        if (newConfig.lang == undefined || newConfig.autoplay == undefined || newConfig.title_trackname == undefined) {
            res.send("error_bad_config");
            return;
        }

        if (langs[newConfig.lang] == undefined) {
            res.send("error_lang_not_found");
            return;
        }

        clientsDB[user].lang = newConfig.lang;
        clientsDB[user].autoplay = newConfig.autoplay;
        clientsDB[user].title_trackname = newConfig.title_trackname;
        saveUsers();

        playlists[user].all.name = langs[newConfig.lang].default_playlist_name;
        savePlaylist("all", user);
        res.send("success");
    });
});

app.post("/getlangs", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    let result = [];

    for (let i in langs) {
        result.push({
            name: i,
            desc: langs[i].lang_desc,
            current: i == clientsDB[user].lang
        });
    }

    res.send(JSON.stringify(result));
});

function dirClear(dirPath) {
    if (fs.statSync(dirPath).isDirectory()) {
        fs.readdirSync(dirPath).forEach(file => {
            let thisPath = dirPath + "/" + file;
            if (fs.statSync(thisPath).isDirectory()) {
                dirClear(thisPath);
            } else {
                fs.unlinkSync(thisPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}

app.post("/removetrack/:trackID/active/:active", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (!isRoot(user) && !config.low_user_edit_tracks_allowed) {
        res.send("edit_not_allowed");
        return;
    }

    var trackID = req.params.trackID;
    let filePath = "./music/" + trackID;

    if (req.params.active === "true") {
        stream.close();
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        try {
            dirClear("./music/" + trackID);

            for (let u in clientsDB) {
                for (var i in playlists[u]) {
                    let index = playlists[u][i].songs.indexOf(trackID);

                    if (index >= 0) {
                        playlists[u][i].songs.splice(index, 1);
                        savePlaylist(i, u);
                        continue;
                    }
                }
            }

            delete lib[trackID];

            res.send("success");
        } catch (e) {
            console.log(e);
            res.send("error");
        }
    } else {
        res.send("error_track_not_found");
    }
});

app.post("/removetracks/:active", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (!isRoot(user) && !config.low_user_edit_tracks_allowed) {
        res.send("edit_not_allowed");
        return;
    }

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    if (req.params.active === "true") {
        stream.close();
    }

    form.parse(req, function (err, fields) {
        if (err) {
            console.log(err);
            res.send("error_parsing_form");
            return;
        }

        let tracks = JSON.parse(fields.tracks);

        for (var i in tracks) {
            if (fs.existsSync("./music/" + tracks[i])) {
                dirClear("./music/" + tracks[i]);

                delete lib[tracks[i]];
                for (let u in clientsDB) {
                    for (var j in playlists[u]) {
                        let index = playlists[u][j].songs.indexOf(tracks[i]);

                        if (index >= 0) {
                            playlists[u][j].songs.splice(index, 1);
                        }
                    }
                }
            }
        }

        res.send(JSON.stringify({
            playlists: playlists[user],
            lib: lib
        }));
    });
});

app.post("/updatetrack/:trackID", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (!isRoot(user) && !config.low_user_edit_tracks_allowed) {
        res.send("edit_not_allowed");
        return;
    }

    var trackID = req.params.trackID;

    if (fs.existsSync("./music/" + trackID)) {
        var form = new formidable.IncomingForm();
        form.encoding = 'utf-8';

        form.parse(req, function (err, fields) {
            if (err) {
                console.log(err);
                res.send("error_parsing_form");
                return;
            }

            let currentSongInfo = require("./music/" + trackID + "/song.json");
            let recievedSongInfo = JSON.parse(fields.songinfo);

            currentSongInfo.lyrics = lib[trackID].lyrics = recievedSongInfo.lyrics;
            currentSongInfo.name = lib[trackID].name = recievedSongInfo.name;

            fs.writeFileSync("./music/" + trackID + "/song.json", JSON.stringify(currentSongInfo));
            res.send("success");
        });
    } else {
        res.send("error_track_not_found");
    }
});

app.post("/updatepos/:trackID/iatrack/:iatrack/playlist/:playlist", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    let trackID = req.params.trackID;
    let iatrack = req.params.iatrack;
    let pl = req.params.playlist;

    if (playlists[user][pl] == undefined) {
        res.send("error");
        return;
    }

    let index = playlists[user][pl].songs.indexOf(trackID);
    let indexIa = playlists[user][pl].songs.indexOf(iatrack);

    if (index < 0 || indexIa < 0) {
        res.send("error");
        return;
    }

    let place = playlists[user][pl].songs.splice(index, 1)[0];
    indexIa = playlists[user][pl].songs.indexOf(iatrack);

    playlists[user][pl].songs.splice(indexIa + 1, 0, place);

    savePlaylist(pl, user);
    res.send(JSON.stringify(playlists[user][pl].songs));
});

function md5(_string) {
    return crypto.createHash('md5').update(_string).digest('hex');
}

app.post("/updateplaylist/:playlist", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (req.params.playlist === "all") {
        res.send("error_parsing_form");
        return;
    }

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields) {
        if (err) {
            console.log(err);
            res.send("error_parsing_form");
            return;
        }

        var pl = req.params.playlist;

        if (pl === "new") {
            if (!isRoot(user) && config.low_user_max_playlists < Object.keys(playlists[user]).length) {
                res.send("error_too_much_playlists");
                return;
            }

            pl = md5(fields.name);
        } else {
            if (playlists[user][pl] == undefined) {
                res.send("error");
                return;
            }

            if (fields.name !== playlists[user][pl].name) {
                delete playlists[user][pl];
                fs.unlinkSync("./playlists/" + user + "/" + pl + ".json");

                pl = md5(fields.name);
            }
        }

        playlists[user][pl] = {
            name: fields.name,
            songs: []
        };

        let tracks = JSON.parse(fields.tracks);
        for (var i in tracks) {
            playlists[user][pl].songs.push(tracks[i]);
        }

        savePlaylist(pl, user);
        res.send(JSON.stringify({
            name: playlists[user][pl].name,
            songs: playlists[user][pl].songs,
            hash: pl
        }));
    });
});

app.post("/removeplaylist/:playlist", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (req.params.playlist === "all") {
        res.send("error");
        return;
    }

    if (!fs.existsSync("./playlists/" + user + "/" + req.params.playlist + ".json") || playlists[user][req.params.playlist] == undefined) {
        res.send("error_playlist_not_found");
        return;
    }

    delete playlists[user][req.params.playlist];
    fs.unlinkSync("./playlists/" + user + "/" + req.params.playlist + ".json");
    res.send("success");
});

function md5File(file) {
    let fileData = fs.openSync(file, 'r');
    let hash = crypto.createHash('md5');
    let buffer = Buffer.alloc(8192);

    try {
        let bytesRead;

        do {
            bytesRead = fs.readSync(fileData, buffer, 0, 8192);
            hash.update(buffer.slice(0, bytesRead));
        } while (bytesRead === 8192);
    } catch (e) {
        return null;
    } finally {
        fs.closeSync(fileData);
    }

    return hash.digest('hex');
}

app.post("/fastupload", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;
    if (!config.low_user_upload_allowed && !isRoot(user)) {
        res.send("upload_not_allowed");
        return;
    }

    let files = fs.readdirSync("./fastupload");

    if (files.length <= 0) {
        res.send("error_no_files_fastupload");
        return;
    }

    let allowedExts = {
        ".mp3": "audio/mp3",
        ".flac": "audio/x-flac",
        ".aac": "audio/aac",
        ".wav": "audio/wav",
        ".wma": "audio/x-ms-wma",
        ".ogg": "audio/ogg"
    };

    var resultPromises = [];

    files.forEach(file => {
        let p = "./fastupload/" + file;

        if (fs.statSync(p).isFile() && Object.keys(allowedExts).indexOf(path.extname(p).toLowerCase()) >= 0) {
            let hash = md5File(p);
            if (hash != null && hash !== "") {
                if (!fs.existsSync("./music/" + hash)) {
                    fs.mkdirSync("./music/" + hash);
                    fs.writeFileSync("./music/" + hash + "/song", fs.readFileSync(p));

                    let info = {
                        name: path.basename(file, path.extname(file)),
                        lyrics: "",
                        has_picture: false,
                        timestamp: Date.now(),
                        type: allowedExts[path.extname(p)]
                    };

                    let songID3Stream = fs.createReadStream(p);

                    resultPromises.push(new Promise(function (resolve, reject) {
                        mm(songID3Stream, function (err, meta) {
                            songID3Stream.close();

                            lib[hash] = {
                                name: info.name,
                                lyrics: "",
                                has_picture: info.has_picture
                            };

                            for (let u in clientsDB) {
                                playlists[u].all.songs.splice(0, 0, hash);
                            }

                            if (!err && meta.picture.length > 0) {
                                let jimpError = false;

                                jimp.read(meta.picture[0].data).then(image => {
                                    let w = image.getWidth();
                                    let h = image.getHeight();

                                    if (w > 1024 && h > 1024) {
                                        image.resize(1024, 1024).quality(80);
                                    }

                                    image.write("./music/" + hash + "/picture.jpg");
                                    info.has_picture = lib[hash].has_picture = true;

                                    fs.appendFileSync("./music/" + hash + "/song.json", JSON.stringify(info), {
                                        encoding: "utf-8"
                                    });

                                    fs.unlinkSync(p);
                                    resolve();

                                    return image;
                                }).catch(err => {
                                    console.log("Error while compressing song " + hash + " image. [" + err + "]");
                                    jimpError = true;
                                });

                                if (!jimpError) {
                                    return;
                                }
                            }

                            fs.appendFileSync("./music/" + hash + "/song.json", JSON.stringify(info), {
                                encoding: "utf-8"
                            });
                            
                            fs.unlinkSync(p);
                            resolve();
                        });
                    }));
                } else {
                    fs.unlinkSync(p);
                }
            }
        }
    });

    if (resultPromises.length > 0) {
        Promise.all(resultPromises).then(function () {
            for (let u in clientsDB) {
                savePlaylist("all", u);
            }
            res.send("success");
        }).catch(function (error) {
            console.log(error);
            for (let u in clientsDB) {
                savePlaylist("all", u);
            }

            res.send("error");
        });
    } else {
        for (let u in clientsDB) {
            savePlaylist("all", u);
        }
        res.send("success");
    }
});

function md5String(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

app.post("/login", function (req, res) {
    if (loginTries[req.ip] != undefined && loginTries[req.ip].length > config.login_tries_to_ban) {
        res.send("error_too_much_tries");
        return;
    }

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields) {
        if (err) {
            res.send("error_parsing_form");
            return;
        }

        logTry(req.ip);
        if (fields["login"] == undefined || fields["login"] === "") {
            res.send("error_wrong_data");
            return;
        }

        if (fields["password"] == undefined || fields["password"] === "") {
            res.send("error_wrong_data");
            return;
        }

        if (clientsDB[fields["login"]] == undefined) {
            res.send("error_wrong_username_or_password");
            return;
        }

        if (clientsDB[fields["login"]].password !== md5String(fields["password"])) {
            res.send("error_wrong_username_or_password");
            return;
        }

        for (let i in clients) {
            if (clients[i].login === fields["login"] && Date.now() > clients[i].loginTimestamp + (1000 * 60 * 60 * config.session_time)) {
                delete clients[i];
            }
        }

        let letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890-=-*/+$%#^&*()[]{}@!";
        let salt = "";

        for (let i = 0; i < 20; i++) {
            salt += letters[Math.floor(Math.random() * letters.length)];
        }

        let hash = md5String(salt);
        clients[hash] = {
            login: fields["login"],
            loginTimestamp: Date.now(),
            ip: req.ip
        };

        res.cookie("session_hash", hash, {
            maxAge: config.session_time * 60 * 60 * 1000
        });
        res.send();
    });
});

app.post("/changepass", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields) {
        if (err) {
            res.send("error_parsing_form");
            return;
        }

        let data = JSON.parse(fields.data);

        if (data.old_pass == undefined || data.new_pass == undefined || data.new_pass_2 == undefined) {
            res.send("error_wrong_data");
            return;
        }

        if (md5String(data.old_pass) !== clientsDB[user].password) {
            res.send("error_wrong_old_password");
            return;
        }

        if (data.new_pass !== data.new_pass_2) {
            res.send("error_new_pass_mismatch");
            return;
        }

        let newPass = md5String(data.new_pass);

        clientsDB[user].password = newPass;
        saveUsers();
        res.send("success");
    });
});

app.post("/removeuser/:user", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (!isRoot(user)) {
        res.send("error_not_allowed");
        return;
    }

    let rmUser = req.params.user;

    if (clientsDB[rmUser] == undefined) {
        res.send("error_user_not_found");
        return;
    }

    if (rmUser === user) {
        res.send("error_cannot_remove_self");
        return;
    }

    delete clientsDB[rmUser];
    saveUsers();

    for (let i in clients) {
        if (clients[i].login == rmUser) {
            delete clients[i];
        }
    }

    dirClear("./playlists/" + rmUser);
    delete playlists[rmUser];

    res.send("success");
});

app.post("/resetpassword/:user", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;

    if (!isRoot(user)) {
        res.send("error_not_allowed");
        return;
    }

    let rpUser = req.params.user;

    if (clientsDB[rpUser] == undefined) {
        res.send("error_user_not_found");
        return;
    }

    let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    let newPassword = "";

    for (let i = 0; i < 7; i++) {
        newPassword += chars[Math.floor(Math.random() * chars.length)];
    }

    clientsDB[rpUser].password = md5String(newPassword);
    saveUsers();
    res.send(newPassword);
});

app.post("/adduser", function (req, res) {
    let session_hash = req.cookies["session_hash"];

    if (!checkSession(session_hash, req.ip)) {
        res.send("error_no_logon");
        return;
    }

    let user = clients[session_hash].login;
    if (!isRoot(user)) {
        res.send("error_not_allowed");
        return;
    }

    var form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields) {
        if (err) {
            res.send("error_parsing_form");
            return;
        }

        let data = JSON.parse(fields.data);

        if (data.login == undefined || data.password == undefined) {
            res.send("error_wrong_data");
            return;
        }

        if (clientsDB[data.login] != undefined) {
            res.send("error_login_already_taken");
            return;
        }

        let newUser = {
            password: md5String(data.password),
            autoplay: config.default_autoplay,
            title_trackname: config.default_autoplay,
            lang: config.default_lang
        };

        clientsDB[data.login] = newUser;

        saveUsers();

        fs.mkdirSync("./playlists/" + data.login);
        playlists[data.login] = {};
        playlists[data.login].all = {
            name: langs[config.default_lang].default_playlist_name,
            songs: []
        };

        for (var i in lib) {
            playlists[data.login].all.songs.splice(0, 0, i);
        }

        savePlaylist("all", data.login);

        res.send("success");
    });
});

app.listen(port);