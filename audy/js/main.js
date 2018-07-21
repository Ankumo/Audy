loadLanguage();

var audio = document.createElement("audio");

var cVolume = parseFloat(getCookie("volume") == undefined ? 0.05 : getCookie("volume"));
audio.volume = cVolume;
audio.pause();

var playMode = 0;
var activePlaylist = "all";
var safeEnd = false;
var safeCheck = false;

$('li[data-role="volbar"] input').val(cVolume * 100);

$(audio).on('loadedmetadata', function () {
    $('div.seekbar').attr("data-max", audio.duration);
    $('li[data-role="max"] a').html(parseTime(audio.duration));
    audio.play();
}).on('timeupdate', function () {
    setValue(audio.currentTime);
    $('li[data-role="current"] a').html(parseTime(audio.currentTime));

    if (Math.floor(audio.duration) == Math.floor(audio.currentTime)) {
        if (!safeCheck) {
            setTimeout(function () {
                if (!safeEnd) {
                    if (playMode == 1) {
                        audio.load();
                    } else {
                        $(audio).trigger("ended");
                    }
                }
                safeEnd = false;
                safeCheck = false;
            }, 1000);
            safeCheck = true;
        }
    }
}).on("progress", function () {
    if (audio.readyState === 4) {
        setBufferedValue(audio.buffered.end(0));
    }
}).on('ended', function () {
    safeEnd = true;
    switch (playMode) {
        case 0:
            if ($('div.songs ul:visible li').last().hasClass("active")) {
                $('div.songs ul:visible li').first().removeClass("active").click();
                return;
            }

            $('li[data-role="next"]').click();
            break;
        case 1:
            audio.currentTime = 0;
            audio.play();
            break;
        case 2:
            var n = $('div.songs ul:visible li').length;
            var rand = Math.floor(Math.random() * n);
            if ($($('div.songs ul:visible li')[rand]).hasClass("active")) {
                rand = rand + 1 >= n ? rand - 1 : rand + 1;
            }

            $($('div.songs ul:visible li')[rand]).click();
            break;
    }
});

$('li[data-role="pause"] img').click(function () {
    if (audio.src === "") {
        $('div.songs ul:visible li[data-role="song"]').first().click();
        return;
    }

    if ($(this).hasClass("paused")) {
        $(this).removeClass("paused");
        audio.play();
        $(this).attr("src", "img/icons/pause.png");
        return;
    }

    audio.pause();
    $(this).addClass("paused");
    $(this).attr("src", "img/icons/play.png");
});

$('div.seekbar').on('click', function (e) {
    var precent = (e.clientX - $('div.seekbar').offset().left - ($('div.seekbar-thumb').width() / 2)) / ($('div.seekbar').width() / 100);
    var val = $('div.seekbar').attr("data-max") / 100 * precent;
    setValue(val);
    audio.currentTime = val;
    if (!audio.paused) {
        audio.play();
    }
});

$('li[data-role="volbar"] input').on('input change', function () {
    audio.volume = $(this).val() / 100;
    setCookie("volume", ($(this).val() / 100), {
        expires: 60 * 60 * 24 * 30,
        path: "/"
    });
});

$('li[data-role="mute"] img').click(function () {
    if (audio.muted) {
        $(this).attr("src", "img/icons/volume_on.png");
        audio.muted = false;
        $('li[data-role="volbar"] input').removeAttr("disabled");
    } else {
        $(this).attr("src", "img/icons/volume_off.png");
        audio.muted = true;
        $('li[data-role="volbar"] input').attr("disabled", "");
    }
});

var isUploading = false;
$('li[data-role="upload"] img').click(function () {
    if (!config["upload_allowed"]) {
        audyAlert(lang["upload_not_allowed"]);
        return;
    }

    if (isUploading) {
        audyAlert(lang["uploading_busy"], true);
        return;
    }

    var input = $('input[name="upload"]');

    if (input.length) {
        $(input).remove();
    }

    input = $('<input style="display: none;" type="file" name="upload" multiple />');
    $(document.body).append(input);

    $(input).change(function () {
        var formData = new FormData();
        var files = [];
        for (var i in $(this).get(0).files) {
            if (files.length >= 20) {
                break;
            }

            switch ($(this).get(0).files[i].type) {
                case "audio/mp4":
                case "audio/aac":
                case "audio/mpeg":
                case "audio/mp3":
                case "audio/ogg":
                case "audio/vorbis":
                case "audio/x-ms-wma":
                case "audio/vnd.wave":
                    files.push($(this).get(0).files[i]);
                    break;
            }
        }

        if (files.length == 0) {
            audyAlert(lang["no_files_will_be_uploaded"], true);
            return;
        } else if (files.length < $(this).get(0).files.length) {
            audyAlert(lang["n_files_will_be_uploaded"].format(files.length, $(this).get(0).files.length), true);
        }

        for (var i = 0; i < files.length; i++) {
            var name = files[i].name;
            name = name.substr(0, name.lastIndexOf(".") > 0 ? name.lastIndexOf(".") : name.length);
            formData.append("file" + i, files[i], name);
        }

        $.ajax({
            url: "/upload",
            type: "POST",
            data: formData,
            contentType: false,
            cache: false,
            processData: false,
            xhr: function () {
                var currentXhr = $.ajaxSettings.xhr();
                isUploading = true;
                if (currentXhr.upload) {
                    currentXhr.upload.addEventListener('progress', function (e) {
                        if (e.lengthComputable) {
                            var pBar = $('div.upload-progress');
                            if (pBar.length <= 0) {
                                pBar = createUploadProgressBar(lang["uploading_progress"].format(files.length) + "...");
                                $(document.body).append(pBar);
                            }

                            var precent = (e.loaded * 100) / e.total;
                            $(pBar).find("progress").val(precent);

                            if (precent >= 100)
                            {
                                $(pBar).find("h4").html(lang["upload_finish"]);
                                $(pBar).delay(2000).fadeOut(1000, function () {
                                    $(this).remove();
                                });
                            }
                        }
                    }, false);
                }
                return currentXhr;
            },
            success: function (data) {
                switch (data) {
                    case "error_parsing_form":
                    case "upload_not_allowed":
                        audyAlert(lang[data]);
                        break;
                    default:
                        var json = JSON.parse(data);
                        isUploading = false;

                        var timestamp = Date.now();
                        cacheQueue[timestamp] = {};

                        var resultErrored = 0;
                        var resultExists = 0;
                        for (var i in json) {
                            if (json[i].error != undefined) {
                                switch (json[i].error) {
                                    case "error_getting_hash":
                                        resultErrored++;
                                        break;
                                    case "error_song_already_exists":
                                        resultExists++;
                                        break;
                                }
                                continue;
                            }

                            $('div.sidebar div.songs ul.all-songs').prepend(createSongBox(json[i].name, json[i].md5));
                            if (json[i].picture.length > 0) {
                                cacheQueue[timestamp][json[i]["md5"]] = json[i].picture;
                            }

                            lib[json[i]["md5"]] = {
                                name: json[i]["name"],
                                lyrics: json[i]["lyrics"]
                            };
                        }

                        updateImages(timestamp);
                        var message = "";
                        if (resultErrored > 0) {
                            message += lang["error_n_songs_error"].format(resultErrored);
                        }

                        if (resultExists > 0) {
                            message += (message === "" ? "" : " ") + lang["error_n_songs_already_exists"].format(resultExists);
                        }

                        if (message !== "") {
                            var ff = json.length - resultErrored - resultExists;
                            audyAlert(message + " " + lang["n_files_uploaded"].format(ff));
                        }
                        break;
                }
            }
        });
    });
    $(input).click();
});

$('li[data-role="toggle"] img').click(function () {
    if ($('div.sidebar').hasClass("toggled")) {
        $('div.sidebar').removeClass("toggled");
        $('div.sidebar').animate({
            right: "-600px"
        }, 200);

        $(this).animate({
            opacity: 0
        }, 100, function () {
            $(this).attr("src", "img/icons/backward.png").animate({
                opacity: 1
            }, 200);
        });
        return;
    }

    $('div.sidebar').animate({
        right: "0"
    }, 200).addClass("toggled");

    $(this).animate({
        opacity: 0
    }, 100, function () {
        $(this).attr("src", "img/icons/forward.png").animate({
            opacity: 1
        }, 200);
    });
});

$(document).on('click', 'li[data-role="song"]', function (e) {
    if ($(e.target).hasClass("track-settings")) {
        if (!config["edit_tracks_allowed"]) {
            audyAlert(lang["edit_not_allowed"]);
            return;
        }

        $('div.overlay').fadeIn();
        $('div.overlay div.track-edit').fadeIn(100, function () {
            $('div.main').addClass("fade");
        });

        $('div.overlay div.track-edit h3').html($(this).attr("title"));
        $('div.overlay div.track-edit input[name="track_name"]').val($(this).attr("title"));
        $('div.overlay div.track-edit').attr("data-md5", $(this).attr("data-md5"));
        $('div.overlay div.track-edit textarea').val(lib[$(this).attr("data-md5")].lyrics);
        return;
    }

    if ($(this).hasClass("dragged")) {
        $(this).removeClass("dragged");
        $('div.songs').stop();

        var iaElement = $('div.songs ul:visible li.downlighted').removeClass("downlighted");

        if (iaElement.length <= 0) {
            return;
        }

        var thisMd5 = $(this).attr("data-md5");
        var pointMd5 = $(iaElement).attr("data-md5");
        var $this = this;
        var pl = activePlaylist;
        $.ajax({
            url: "/updatepos/" + thisMd5 + "/iatrack/" + pointMd5 + "/playlist/" + pl,
            type: "POST",
            success: function (data) {
                if (data === "error") {
                    audyAlert(lang[data]);
                    return;
                }

                playlists[pl].songs = JSON.parse(data);
                $($this).insertAfter(iaElement);
            }
        });

        return;
    }

    if ($(this).hasClass("active")) {
        return;
    }

    audio.pause();
    $(audio).attr("src", "http://" +location.host+ "/track/" + $(this).attr("data-md5"));
    $(this).add($('li[data-role="song"].active')).toggleClass("active");
    $('li[data-role="pause"] img').attr("src", "img/icons/pause.png").removeClass("paused");

    if ($('div.track-album div.track-lyrics:visible').length > 0) {
        $('div.track-album div.track-lyrics').hide();
        $('div.track-album img').show();
    }

    var lyrics = lib[$(this).attr("data-md5")].lyrics;
    $('div.track-album div.track-lyrics p').html(lyrics === "" ? lang["no_lyrics"] : lib[$(this).attr("data-md5")].lyrics);

    var src = $(this).find("img").attr("src");
    if (src.indexOf("blob:") >= 0) {
        $('div.track-info div.track-album img').animate({
            opacity: 0
        }, 100, function () {
            $(this).attr("src", src).animate({
                opacity: 1
            }, 200);
        });
    } else {
        if ($('div.track-info div.track-album img').attr("src").indexOf("blob:") >= 0) {
            $('div.track-info div.track-album img').animate({
                opacity: 0
            }, 100, function () {
                $(this).attr("src", "img/default_album.png").animate({
                    opacity: 1
                }, 200);
            });
        }
    }

    var title = $(this).attr("title");
    $('div.track-info div.track-title a').animate({
        opacity: 0
    }, 100, function () {
        if (config.title_trackname) {
            document.title = title;
        }

        $(this).html(title).animate({
            opacity: 1
        }, 200);
    });
}).on('click', 'div.sidebar div.playlists-list ul li:not(.add-playlist)', function () {
    if ($(this).hasClass("active")) {
        return;
    }

    $('div.sidebar div.playlists-list ul').stop().slideUp(200, function () {
        $('div.playlists-list').removeClass("active");
    });
    $('div.sidebar div.playlists-list ul li.active').add($(this)).toggleClass("active");
    $('div.sidebar div.playlists-list span').html($(this).find("div").html());

    var pl = $(this).find("div").attr("data-key");
    activePlaylist = pl;
    if (pl === "all") {
        $('div.playlist-control-toggle').fadeOut();
        $('div.songs ul.playlisted-songs').empty().fadeOut();
        $('div.songs ul.all-songs').fadeIn();
        return;
    } else {
        $('div.playlist-control-toggle').fadeIn();
    }

    $('div.songs ul.all-songs:visible').fadeOut(200, function () {
        $('div.songs ul.playlisted-songs').empty().fadeIn();
        for (var i in playlists[pl].songs) {
            var hash = playlists[pl].songs[i];
            $('div.songs ul.playlisted-songs').append(createSongBox(lib[hash].name, hash, imagesCache[hash]));
        }
    });
}).on('click', function (e) {
    if ($.contains($('div.playlists-list').get(0), e.target)) {
        return;
    }

    var pList = $('div.playlists-list.active');
    if (pList.length > 0) {
        $(pList).find('ul').stop().slideUp(200, function () {
            $(pList).removeClass("active");
        });
    }
}).on('click', 'div.sidebar div.playlists-list ul li.add-playlist', function () {
    $('div.playlists-list ul').stop().slideUp(200, function () {
        $('div.playlists-list').removeClass("active");
    });

    $('div.overlay').fadeIn();
    $('div.playlist-control').attr("data-pl", "new");
    $('div.playlist-control h3').html(lang["add_playlist"]);
    $('div.playlist-control input[name="playlist_name"]').val("");
    var ul = $('div.playlist-control div.playlist-control-table div.playlist-control-songs ul').empty();

    for (var i in playlists.all.songs) {
        $(ul).append(createPlaylistEditSongBox(lib[playlists.all.songs[i]].name, playlists.all.songs[i], false));
    }

    $('div.overlay div.playlist-control').fadeIn(100, function () {
        $('div.main').addClass("fade");
    });

    $('div.playlist-control button[name="save"]').addClass("green").html(lang["button_add"]);
    $('div.playlist-control button[name="delete"]').removeClass("red").html(lang["button_cancel"]);
});

$('li[data-role="next"]').click(function () {
    if ($('div.songs ul li').last().hasClass("active")) {
        return;
    }

    $('div.songs ul li.active').next().click();
});

$('li[data-role="prev"]').click(function () {
    if ($('div.songs ul li').first().hasClass("active")) {
        return;
    }

    $('div.songs ul li.active').prev().click();
});

$('div.playlists-list').click(function (e) {
    if ($(e.target).prop("tagName").toLowerCase() !== "span") {
        return;
    }

    var ul = $(this).find('ul');
    if ($(this).hasClass("active")) {
        $(ul).stop().slideUp(200, function () {
            $('div.playlists-list').removeClass("active");
        });
        return;
    }

    $(ul).stop().slideDown(200);
    $(this).addClass("active");
});

var config = {};

$(document).ready(function () {
    $.ajax({
        url: "/getjson/loadpack",
        type: "POST",
        async: false,
        success: function (data) {
            var json = JSON.parse(data);

            //config
            config = json.config;
            $('div.settings ul.form-fields input[name="autoplay"]').attr("checked", config.autoplay);
            $('div.settings ul.form-fields input[name="title_trackname"]').attr("checked", config.title_trackname);

            //lib
            lib = json.lib;

            //playlists
            playlists = json.playlists;
            $('div.playlists-list ul').empty();

            $('div.playlists-list ul').append($('<li class="active"><div data-key="all">' + playlists.all.name + '</div></li>'));
            for (var i in playlists) {
                if (i === "all") {
                    continue;
                }

                $('div.playlists-list ul').append($('<li><div data-key="' + i + '">' + playlists[i]["name"] + '</div></li>'));
            }

            $('div.playlists-list ul').append($('<li class="add-playlist"><div>' + lang["add_playlist"] + '</div></li>'));

            for (var i in playlists.all.songs) {
                $('div.songs ul.all-songs').append(createSongBox(lib[playlists.all.songs[i]].name, playlists.all.songs[i]));
            }

            //cache
            var loaded = Math.floor($("div.songs ul.all-songs").height() / 46) + 5;

            if (loaded > $('div.songs ul.all-songs li').length) {
                loaded = $('div.songs ul.all-songs li').length;
            }

            var firstCache = [];
            for (var i = 0; i < loaded; i++) {
                var md5 = $($("div.songs ul.all-songs li")[i]).attr("data-md5");
                firstCache.push(md5);
            }

            cacheImages(firstCache);

            if (config["autoplay"]) {
                $('div.songs ul li').first().click();
            }

            if (!config.upload_allowed) {
                $('li[data-role="upload"]').remove();
                $('button[name="fastupload"]').remove();
            }

            if (!config.edit_tracks_allowed) {
                $('div.overlay-container.track-edit').remove();
                $('li[data-role="file-manager"]').remove();
                $('div.overlay-container.file-manager').remove();
            }
            
            if(!config.is_root) {
                $('div.overlay-container.add-user').remove();
                $('div.overlay-container.users-list').remove();
                $('li[data-role="users-list"]').remove();
            }
        }
    });

    $.ajax({
        url: "/getlangs",
        type: "POST",
        success: function (data) {
            var json = JSON.parse(data);

            for (var i in json) {
                var option = $('<option value="' + json[i]["name"] + '"' + (json[i]["current"] ? " selected" : "") + '>' + json[i]["desc"] + '</option>');
                $('div.settings ul.form-fields select[name="lang_change"]').append(option);
            }
        }
    });

    if (config.is_root) {
        $.ajax({
            url: "/getjson/users",
            type: "POST",
            success: function (data) {
                var users = JSON.parse(data);

                var table = $('div.users-list table');

                var i = 0;
                for (var u in users) {
                    i++;

                    var tr = $('<tr data-login="' + u + '"><td>' + i + '</td><td>' + u + '</td>\n\
                                <td><select>\n\
                                <option data-lang="th_actions" value disabled selected>' + lang["th_actions"] + '</option>\n\
                                <option data-lang="button_delete" value="delete">' + lang["button_delete"] + '</option>\n\
                                <option data-lang="reset_password" value="reset_password">' + lang["reset_password"] + '</option></select></td></tr>');

                    $(table).find('tbody').append(tr);
                }
            }
        });
    }
});

$('li[data-role="settings"] img').click(function () {
    $('div.overlay').fadeIn();
    $('div.overlay div.settings').fadeIn(100, function () {
        $('div.main').addClass("fade");
    });
});

$('div.settings button[name="save"]').click(function () {
    var newConfig = {};

    for (var i in config) {
        newConfig[i] = config[i];
    }

    newConfig["lang"] = $('select[name="lang_change"]').val();
    newConfig["autoplay"] = $('input[name="autoplay"]').get(0).checked;
    newConfig["title_trackname"] = $('input[name="title_trackname"]').get(0).checked;

    if (JSON.stringify(newConfig) !== JSON.stringify(config)) {
        $.ajax({
            url: "/setconfig",
            type: "POST",
            data: {
                newConfig: JSON.stringify(newConfig)
            },
            success: function (data) {
                switch (data) {
                    case "error_parsing_form":
                    case "error_bad_config":
                    case "error_lang_not_found":
                        audyAlert(lang[data]);
                        break;
                    case "success":
                        if (newConfig["lang"] !== config["lang"]) {
                            loadLanguage();
                            audyAlert(lang["settings_saved"]);
                        } else {
                            audyAlert(lang["settings_saved"]);
                        }

                        if (newConfig.title_trackname) {
                            var active = $('div.songs ul:visible li.active');
                            if(active.length > 0) {
                                document.title = $(active).attr("title");
                            } else {
                                document.title = "Audy Player v0.1";
                            }
                        } else {
                            document.title = "Audy Player v0.1";
                        }

                        config = newConfig;
                        break;
                    default:
                        console.log(data);
                        break;
                }
            }
        });
    }
});

$('div.track-edit button[name="delete"]').click(function () {
    if (!config.edit_tracks_allowed) {
        audyAlert(lang["edit_not_allowed"]);
        return;
    }

    var active = $('div.track-edit').attr("data-md5") === $('div.songs ul:visible li.active').attr("data-md5");
    audyConfirm(lang["confirm_delete_track"], function () {
        $.ajax({
            url: "/removetrack/" + $('div.track-edit').attr("data-md5") + "/active/" + active,
            type: "POST",
            success: function (data) {
                switch (data) {
                    case "success":
                        if (active) {
                            if ($('div.songs ul:visible li.active').next().length > 0) {
                                $('div.songs ul:visible li.active').next().click();
                            } else {
                                $('div.songs ul:visible li').first().click();
                            }
                        }
                        removeTrackLocal($('div.track-edit').attr("data-md5"));
                        audyAlert(lang["track_has_been_removed"]);
                        break;
                    case "error_track_not_found":
                        if (active) {
                            if ($('div.songs ul:visible li.active').next().length > 0) {
                                $('div.songs ul:visible li.active').next().click();
                            } else {
                                $('div.songs ul:visible li').first().click();
                            }
                        }
                        removeTrackLocal($('div.track-edit').attr("data-md5"));
                        audyAlert(lang[data]);
                        break;
                    case "error":
                        audyAlert(lang["error_while_removing_track"]);
                        break;
                    case "edit_not_allowed":
                        audyAlert(lang[data]);
                        break;
                    default:
                        console.log(data);
                        break;
                }
            }
        });
    }, true);
});

$('div.track-edit button[name="save"]').click(function () {
    if (!config.edit_tracks_allowed) {
        audyAlert(lang["edit_not_allowed"]);
        return;
    }

    var editsChanged = false;
    var md5 = $('div.track-edit').attr("data-md5");

    if ($('div.track-edit ul.form-fields li input[name="track_name"]').val() !== lib[md5].name) {
        editsChanged = true;
    }

    if ($('div.track-edit ul.form-fields li textarea[name="track_lyrics"]').val() !== lib[md5].lyrics) {
        editsChanged = true;
    }

    var songInfo = {
        lyrics: $('div.track-edit ul.form-fields li textarea[name="track_lyrics"]').val(),
        name: $('div.track-edit ul.form-fields li input[name="track_name"]').val()
    };

    if (editsChanged) {
        $.ajax({
            url: "/updatetrack/" + md5,
            type: "POST",
            data: {
                songinfo: JSON.stringify(songInfo)
            },
            success: function (data) {
                switch (data) {
                    case "error_parsing_form":
                    case "edit_not_allowed":
                        audyAlert(lang[data]);
                        break;
                    case "error_track_not_found":
                        removeTrackLocal($(this).attr("data-md5"));
                        audyAlert(lang[data]);
                        break;
                    case "success":
                        audyAlert(lang["track_edited"]);
                        lib[md5].lyrics = songInfo.lyrics;
                        lib[md5].name = songInfo.name;

                        var elems = findSong(md5);

                        if (elems.all.length > 0) {
                            $(elems.all).attr("title", songInfo.name);
                            $(elems.all).find("div.song-title").html(songInfo.name);

                            if ($(elems.all).hasClass("active")) {
                                $('div.track-title a').html(songInfo.name);
                            }
                        }

                        if (elems.pl.length > 0) {
                            $(elems.pl).attr("title", songInfo.name);
                            $(elems.pl).find("div.song-title").html(songInfo.name);

                            if ($(elems.pl).hasClass("active")) {
                                $('div.track-title a').html(songInfo.name);
                            }
                        }

                        $('div.track-lyrics p').html(songInfo.lyrics === "" ? lang["no_lyrics"] : songInfo.lyrics);
                        break;
                    default:
                        console.log(data);
                        break;
                }
            }
        });
    }
});

var searchInterval;
$('div.tracks-search input[name="search"]').on('input paste', function () {
    var search = $(this).val().toLowerCase();

    clearInterval(searchInterval);

    if (search === "") {
        $('div.songs div.search-fallback').hide();
        $('div.songs ul:visible li:hidden').show();
        return;
    }

    searchInterval = setInterval(function () {
        $('div.songs div.search-fallback').hide();
        $('div.songs ul:visible li div.song-title').each(function () {
            if ($(this).html().toLowerCase().indexOf(search) < 0) {
                $(this).parent().hide();
            } else {
                if ($(this).parent().is(":hidden")) {
                    $(this).parent().show();
                }
            }
        });

        if ($('div.songs ul:visible li:visible').length <= 0) {
            $('div.songs div.search-fallback').show();
        }
    }, 500);
});

var dragInterval;
$(document).on('mousedown', 'li[data-role="song"]', function (e) {
    var $this = this;

    clearInterval(dragInterval);
    dragInterval = setInterval(function () {
        $($this).addClass("dragged");
    }, 500);
}).on('mousemove', 'div.songs', function (e) {
    var li = $('div.songs ul:visible li.dragged');

    if (li.length > 0) {
        $(li).css({
            top: e.clientY - 18
        });

        if (e.clientY >= ($('div.sidebar').height() - 80)) {
            var h = $('div.songs ul:visible').height();
            var target = h - $('div.sidebar').height() + 50;
            var distance = target - $('div.songs').scrollTop();

            $('div.songs').animate({
                scrollTop: target
            }, distance, 'linear');
        } else if (e.clientY <= $('div.playlists').height() + 80) {
            $('div.songs').animate({
                scrollTop: 0
            }, $('div.songs').scrollTop(), 'linear');
        } else {
            $('div.songs').stop();
        }

        var cursor = document.elementFromPoint(e.clientX, e.clientY + 24);
        if ($(cursor).attr("data-role") === "song" && !$(cursor).hasClass("downlighted")) {
            $('div.songs ul:visible li.downlighted').removeClass("downlighted");
            $(cursor).addClass("downlighted");
        }
    }
}).on('mouseup', function () {
    clearInterval(dragInterval);
}).on('click', 'div.overlay:visible', function (e) {
    if ($(e.target).hasClass("overlay")) {
        $('div.overlay > div').fadeOut(100, function () {
            $('div.overlay').fadeOut(100);
            $('div.main').removeClass("fade");
        });
    }
});

$('li[data-role="playmode"] img').click(function () {
    switch (playMode) {
        case 0:
            playMode = 1;
            break;
        case 1:
            playMode = 2;
            break;
        case 2:
            playMode = 0;
            break;
    }

    $(this).attr({
        src: "img/icons/playmode_" + playMode + ".png",
        title: lang["playmode_" + playMode]
    });
});

$('div.playlist-control-toggle img').click(function () {
    $('div.overlay').fadeIn();
    var pl = $('div.playlists-list ul li.active div').attr("data-key");
    $('div.playlist-control').attr("data-pl", pl);
    $('div.playlist-control h3').html(playlists[pl].name);
    $('div.playlist-control input[name="playlist_name"]').val(playlists[pl].name);
    var ul = $('div.playlist-control div.playlist-control-table div.playlist-control-songs ul').empty();

    for (var i in playlists.all.songs) {
        var hash = playlists.all.songs[i];
        $(ul).append(createPlaylistEditSongBox(lib[hash].name, hash, playlists[$('div.playlist-control').attr("data-pl")].songs.indexOf(hash) >= 0));
    }

    $('div.overlay div.playlist-control').fadeIn(100, function () {
        $('div.main').addClass("fade");
    });

    $('div.playlist-control button[name="save"]').removeClass("green").html(lang["button_save"]);
    $('div.playlist-control button[name="delete"]').addClass("red").html(lang["button_delete"]);
});

$('div.playlist-control button[name="save"]').click(function () {
    if ($('div.playlist-control').find('input[name="playlist_name"]').val() === "") {
        audyAlert(lang["error_empty_playlist_name"], true);
        return;
    }

    var choosed = $('div.playlist-control div.playlist-control-songs ul');

    if ($(choosed).find("li.active").length <= 0) {
        audyAlert(lang["error_empty_playlist_songs"], true);
        return;
    }

    var pl = $('div.playlist-control').attr("data-pl");

    var tracks = [];

    if (pl === "new") {
        if (config.max_playlists < Object.keys(playlists).length) {
            audyAlert(lang["error_too_much_playlists"]);
            return;
        }

        $(choosed).find("li.active").each(function () {
            if (tracks.indexOf($(this).attr("data-md5")) < 0) {
                tracks.push($(this).attr("data-md5"));
            }
        });
    } else {
        for (var i in playlists[pl].songs) {
            tracks.push(playlists[pl].songs[i]);
        }

        $(choosed).find("li.active").each(function () {
            if (tracks.indexOf($(this).attr("data-md5")) < 0) {
                tracks.splice(tracks.length - playlists[pl].songs.length, 0, $(this).attr("data-md5"));
            }
        });

        $(choosed).find("li:not(.active)").each(function () {
            var index = tracks.indexOf($(this).attr("data-md5"));
            if (index >= 0) {
                tracks.splice(index, 1);
            }
        });
    }

    $.ajax({
        url: "/updateplaylist/" + pl,
        type: "POST",
        data: {
            tracks: JSON.stringify(tracks),
            name: $('div.playlist-control').find('input[name="playlist_name"]').val()
        },
        success: function (data) {
            switch (data) {
                case "error_parsing_form":
                    audyAlert(lang[data], true);
                    break;
                case "error":
                case "error_too_much_playlists":
                    audyAlert(lang[data]);
                    break;
                default:
                    var json = JSON.parse(data);

                    if (playlists[json.hash] == undefined) {
                        if (pl === "new") {
                            $('<li><div data-key="' + json.hash + '">' + json.name + '</div></li>').insertBefore($('div.playlists-list ul li.add-playlist')).click();
                        } else {
                            delete playlists[pl];
                            $('div.playlists-list div[data-key="' + pl + '"]').attr("data-key", json.hash).html(json.name);
                            $('div.playlists-list span').html(json.name);
                        }

                        activePlaylist = json.hash;
                        playlists[json.hash] = {
                            name: json.name,
                            songs: json.songs
                        };
                    } else {
                        playlists[json.hash].songs = json.songs;
                    }

                    $('div.songs ul.playlisted-songs').empty();
                    for (var i in json.songs) {
                        $('div.songs ul.playlisted-songs').append(createSongBox(lib[json.songs[i]].name, json.songs[i], imagesCache[json.songs[i]]));
                    }
                    audyAlert(lang["playlist_updated"].format(json.name));
                    break;
            }
        }
    });
});

$('div.playlist-control button[name="delete"]').click(function () {
    if (!$(this).hasClass("red")) {
        $('div.overlay > div').fadeOut(100, function () {
            $('div.overlay').fadeOut(100);
            $('div.main').removeClass("fade");
        });
        return;
    }

    var pl = $('div.playlist-control').attr("data-pl");

    audyConfirm(lang["confirm_delete_playlist"].format(playlists[pl].name), function () {
        $.ajax({
            url: "/removeplaylist/" + pl,
            type: "POST",
            success: function (data) {
                switch (data) {
                    case "error":
                    case "error_playlist_not_found":
                        audyAlert(lang[data]);
                        break;
                    case "success":
                        audyAlert(lang["playlist_removed"].format(playlists[pl].name));
                        delete playlists[pl];
                        activePlaylist = "all";

                        $('div.playlists-list div[data-key="' + pl + '"]').parent().remove();
                        $('div.playlists-list div[data-key="all"]').click();

                        if (!audio.paused) {
                            $('div.songs ul.all-songs li').first().click();
                        }
                        break;
                    default:
                        console.log(data);
                        break;
                }
            }
        });
    });
});

$('li[data-role="file-manager"] img').click(function () {
    $('div.overlay').fadeIn();
    $('div.file-manager div.file-manager-files ul').empty();
    for (var i in playlists.all.songs) {
        $('div.file-manager div.file-manager-files ul').append(createPlaylistEditSongBox(lib[playlists.all.songs[i]].name, playlists.all.songs[i]));
    }
    $('div.overlay div.file-manager').fadeIn(100, function () {
        $('div.main').addClass("fade");
    });
});

$('button[name="fastupload"]').click(function () {
    if (!config["upload_allowed"]) {
        audyAlert(lang["upload_not_allowed"]);
        return;
    }

    audyConfirm(lang["fastupload_descr"], function () {
        $.ajax({
            url: "/fastupload",
            type: "POST",
            success: function (data) {
                switch (data) {
                    case "success":
                        location.href = "/";
                        break;
                    case "error_no_files_fastupload":
                    case "upload_not_allowed":
                    case "error":
                        audyAlert(lang[data]);
                        break;
                    default:
                        console.log(data);
                        break;
                }
            }
        });
    });
});

$('div.file-manager button[name="delete"]').click(function () {
    var choosed = $('div.file-manager-files ul li.active');
    if (choosed.length <= 0) {
        audyAlert(lang["error_empty_playlist_songs"], true);
        return;
    }

    audyConfirm(lang["delete_files_confirm"].format(choosed.length), function () {
        var tracks = [];
        var active = false;

        for (var i = 0; i < choosed.length; i++) {
            tracks.push($(choosed[i]).attr("data-md5"));
            if (!active && $('li[data-role="song"][data-md5="' + $(choosed[i]).attr("data-md5") + '"]').hasClass("active")) {
                active = true;
            }
        }

        $.ajax({
            url: "/removetracks/" + active,
            type: "POST",
            data: {
                tracks: JSON.stringify(tracks)
            },
            success: function (data) {
                var json = JSON.parse(data);
                var deleted = 0;
                if (activePlaylist === "all") {
                    for (var i in lib) {
                        if (json.lib[i] == undefined) {
                            $('div.songs ul.all-songs li[data-md5="' + i + '"]').remove();
                            deleted++;
                        }
                    }
                } else {
                    for (var i in lib) {
                        if (json.lib[i] == undefined) {
                            $('div.songs ul.all-songs li[data-md5="' + i + '"]').add($('div.songs ul.playlisted-songs li[data-md5="' + i + '"]')).remove();
                            deleted++;
                        }
                    }
                }

                lib = json.lib;
                playlists = json.playlists;
                audyAlert(lang["n_files_has_been_deleted"].format(deleted));

                if (active) {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.src = "";
                    audio.load();
                    $('li[data-role="pause"] img').removeClass("paused").attr("src", "img/icons/pause.png");
                }
            }
        });

    });
});

$('div.track-album').click(function () {
    if ($('li[data-role="song"].active').length <= 0) {
        return;
    }

    if ($(this).find("div.track-lyrics:visible").length > 0) {
        $(this).find("div.track-lyrics").fadeOut(100, function () {
            $('div.track-album img').fadeIn(200);
        });
    } else {
        $(this).find("img").fadeOut(100, function () {
            $('div.track-album div.track-lyrics').fadeIn(200);
        });
    }
});

$('li[data-role="logout"]').click(function () {
    audyConfirm(lang["logout_confirm"], function () {
        deleteCookie("session_hash");
        location.href = "/";
    });
});

$('button[name="checkall"]').click(function () {
    $('div.file-manager-files ul li:not(.active)').click();
});

$('button[name="uncheckall"]').click(function () {
    $('div.file-manager-files ul li.active').click();
});

$('button[name="cancel"]').click(function () {
    $('div.overlay > div:visible').fadeOut(100, function () {
        $('div.overlay').fadeOut(100);
        $('div.main').removeClass("fade");
    });
});

$('div.change-password button[name="chpwd"]').click(function () {
    var data = {
        old_pass: $('input[name="old_pass"]').val(),
        new_pass: $('input[name="new_pass"]').val(),
        new_pass_2: $('input[name="new_pass_2"]').val()
    };

    $.ajax({
        url: "/changepass",
        type: "POST",
        data: {
            data: JSON.stringify(data)
        },
        success: function (data) {
            switch (data) {
                case "error_parsing_form":
                    audyAlert(lang[data]);
                    break;
                case "error_wrong_old_password":
                case "error_new_pass_mismatch":
                    audyAlert(lang[data], true);
                    break;
                case "success":
                    audyAlert(lang["password_changed"]);
                    break;
                default:
                    console.log(data);
                    break;
            }
        }
    });
});

$('div.settings button[name="chpwd"]').click(function () {
    $('div.overlay > div:visible').fadeOut(100, function () {
        $('div.overlay').fadeIn();
        $('div.overlay div.change-password').fadeIn(100, function () {
            $('div.main').addClass("fade");
        });
    });
});

$('li[data-role="users-list"]').click(function () {
    $('div.overlay').fadeIn();
    $('div.overlay div.users-list').fadeIn(100, function () {
        $('div.main').addClass("fade");
    });
});

$(document).on("change", "div.users-list table select", function () {
    var action = $(this).val();
    $(this).val("");

    var tr = $(this).closest("tr");
    var user = $(tr).attr("data-login");

    switch (action) {
        case "delete":
            $.ajax({
                url: "/removeuser/" + user,
                type: "POST",
                success: function (data) {
                    switch (data) {
                        case "error_user_not_found":
                        case "error_not_allowed":
                            audyAlert(lang[data]);
                            break;
                        case "success":
                            audyAlert(lang["user_removed"].format(user), true);
                            
                            $(tr).remove();
                            recountTable($('div.users-list table'));
                            break;
                        case "error_cannot_remove_self":
                            audyAlert(lang[data], true);
                            break;
                        default:
                            console.log(data);
                            break;
                    }
                }
            });
            break;
        case "reset_password":
            $.ajax({
                url: "/resetpassword/" + user,
                type: "POST",
                success: function (data) {
                    switch (data) {
                        case "error_user_not_found":
                        case "error_not_allowed":
                            audyAlert(lang[data]);
                            break;
                        default:
                            audyAlert(lang["password_resetted"].format(user, data), true);
                            break;
                    }
                }
            });
            break;
    }
});

$('button[name="adduser"]').click(function () {
    $('div.overlay > div:visible').fadeOut(100, function () {
        $('div.overlay').fadeIn();
        $('div.overlay div.add-user').fadeIn(100, function () {
            $('div.main').addClass("fade");
        });
    });
});

$('div.add-user button[name="add"]').click(function() {
    if(!config.is_root) {
        audyAlert(lang["error_not_allowed"]);
        return;
    }
    
    var userData = {
        login: $('div.add-user input[name="login"]').val(),
        password: $('div.add-user input[name="password"]').val()
    };
    
    $.ajax({
        url: "/adduser",
        type: "POST",
        data: {
            data: JSON.stringify(userData)
        },
        success: function(data) {
            switch(data) {
                case "error_not_allowed":
                case "error_parsing_form":
                case "error_wrong_data":
                    audyAlert(lang[data]);
                    break;
                case "error_login_already_taken":
                    audyAlert(lang[data], true);
                    break;
                case "success":
                    audyAlert(lang["user_added"].format(userData.login));
                    
                    $('div.users-list table tbody').append($('<tr data-login="'+userData.login+'"><td></td><td>'+userData.login+'</td>\n\
                            <td><select><option data-lang="th_actions" value disabled selected>' + lang["th_actions"] + '</option>\n\
                                <option data-lang="button_delete" value="delete">' + lang["button_delete"] + '</option>\n\
                                <option data-lang="reset_password" value="reset_password">' + lang["reset_password"] + '</option></select></td></tr>'));
                    recountTable($('div.users-list table'));
                    
                    $('div.add-user input').val("");
                    break;
                default:
                    console.log(data);
                    break;
            }
        }
    });
});