var lang = {};
var playlists = {};
//var imagesCache = {};
//var cacheQueue = {};
var lib = {};

String.prototype.format = function () {
    var args = arguments;
    return this.replace(/\{(\d+)\}/g, function (m, n) {
        return args[n] ? args[n] : m;
    });
};

//getting cookie by name
function getCookie(name) {
    var matches = document.cookie.match(new RegExp(
            "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
            ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
}

//setting cookies
function setCookie(name, value, options) {
    options = options || {};

    var expires = options.expires;

    if (typeof expires == "number" && expires) {
        var d = new Date();
        d.setTime(d.getTime() + expires * 1000);
        expires = options.expires = d;
    }
    if (expires && expires.toUTCString) {
        options.expires = expires.toUTCString();
    }

    value = encodeURIComponent(value);

    var updatedCookie = name + "=" + value;

    for (var propName in options) {
        updatedCookie += "; " + propName;
        var propValue = options[propName];
        if (propValue !== true) {
            updatedCookie += "=" + propValue;
        }
    }

    document.cookie = updatedCookie;
}

//removing cookies
function deleteCookie(name) {
    setCookie(name, "", {
        expires: -1
    });
}

function parseTime(time) {
    var h = Math.floor(time / (60 * 60));
    var m = Math.floor(time / 60);
    var s = Math.floor(time - m * 60);

    var result = "";

    result += h > 0 ? h + ":" : "";
    result += m + ":";
    result += s > 9 ? "" + s : "0" + s;

    return result;
}

function setValue(value) {
    var set = value / ($('div.seekbar').attr("data-max") / 100);
    var px = $('div.seekbar').width() / 100 * set;
    $('div.seekbar-overlay').css("width", px + "px");
    $('div.seekbar-thumb').css("left", (px - ($('div.seekbar-thumb').width() / 2)) + "px");
}

function getValue() {
    return $('div.seekbar-overlay').width() / ($('div.seekbar').width() / 100);
}

function setBufferedValue(value) {
    var set = value / ($('div.seekbar').attr("data-max") / 100);
    $('div.seekbar-buffered').css("width", set + "%");
}

function audyAlert(message, allowBackdrop) {
    allowBackdrop = allowBackdrop == undefined ? false : allowBackdrop;

    if ($('div.audy-alert').length) {
        $('div.audy-alert').fadeOut(200, function () {
            $(this).remove();
        });
    }

    if ($('div.overlay > div:visible').length > 0) {
        if (allowBackdrop) {
            $('div.overlay > div:visible').addClass("backdroped");
        }

        $('div.overlay > div:visible').fadeOut(100);
    }

    var aa = $('<div class="audy-alert"><div class="audy-alert-wrapper"><a>' + message + '</a>\n\
                    <div class="audy-alert-buttons"><button>' + lang["button_ok"] + '</button></div></div></div>');
    $(aa).find("button").click(function () {
        $('div.audy-alert').remove();

        if ($('div.overlay > div.backdroped').length > 0) {
            $('div.overlay > div.backdroped').removeClass("backdroped").fadeIn(100);
        } else {
            $('div.main').removeClass("fade");
            $('div.overlay').hide();
        }
    });

    $('div.overlay').show().append(aa);
    $('div.main').addClass("fade");
}

function audyConfirm(message, cb, allowBackdrop) {
    allowBackdrop = allowBackdrop == undefined ? false : allowBackdrop;

    if ($('div.audy-confirm').length) {
        $('div.audy-confirm').fadeOut(200, function () {
            $(this).remove();
        });
    }

    if ($('div.overlay > div:visible').length > 0) {
        if (allowBackdrop) {
            $('div.overlay > div:visible').addClass("backdroped");
        }

        $('div.overlay > div:visible').fadeOut(100);
    }

    var ac = $('<div class="audy-alert"><div class="audy-alert-wrapper"><a>' + message + '</a>\n\
                    <div class="audy-alert-buttons"><button class="green ok">' + lang["button_ok"] + '</button>\n\
                        <button class="cancel">' + lang["button_cancel"] + '</button></div></div></div>');
    $(ac).find("button").click(function (e) {
        $('div.audy-alert').remove();

        if ($('div.overlay > div.backdroped').length > 0) {
            $('div.overlay > div.backdroped').removeClass("backdroped").fadeIn(100);
        } else {
            $('div.main').removeClass("fade");
        }

        if ($(e.target).hasClass("ok")) {
            cb();
        }
    });

    $('div.overlay').show().append(ac);
    $('div.main').addClass("fade");
}

function createSongBox(title, hash) {
    let image = getSongImage(hash);
    return $('<li ' + (activeTrack === hash ? 'class="active"' : "") + ' data-role="song" data-md5="' + hash + '" title="' + title + '"><img class="album-image" src="' + image + '" />\n\
            <div class="song-title">' + title + '</div>' + (config["edit_tracks_allowed"] ? '<img class="track-settings" src="img/icons/settings.png" />\n\
            </li>' : ""));
}

function loadLanguage() {
    $.ajax({
        url: "/getjson/lang",
        type: "POST",
        async: false,
        success: function (data) {
            lang = JSON.parse(data);

            //headers
            $('div.users-list h3').html(lang["users_list_title"]);
            $('div.file-manager h3').html(lang["file_manager_title"]);
            $('div.add-user h3').html(lang["button_adduser"]);
            $('div.settings h3').html(lang["settings"]);
            $('div.playlists h3').html(lang["playlist"] + ":");

            //titles
            $('li[data-role="users-list"]').attr("title", lang["users_list_title"]);
            $('li[data-role="file-manager"]').attr("title", lang["file_manager_title"]);
            $('li[data-role="playmode"]').attr("title", lang["playmode_0"]);
            $('li[data-role="settings"]').attr("title", lang["settings"]);
            $('li[data-role="upload"]').attr("title", lang["upload"]);
            $('li[data-role="logout"]').attr("title", lang["logout"]);
            $('div.playlist-control-toggle').attr("title", lang["playlist_control_toggle_title"]);

            //buttons
            $('button[name="reload_users"]').html(lang["button_reload_users"]);
            $('button[name="checkall"]').html(lang["button_checkall"]);
            $('button[name="uncheckall"]').html(lang["button_uncheckall"]);
            $('button[name="cancel"]').html(lang["button_cancel"]);
            $('button[name="adduser"]').html(lang["button_adduser"]);
            $('button[name="chpwd"]').html(lang["button_chpwd"]);
            $('button[name="fastupload"]').html(lang["button_fastupload"]);
            $('button[name="save"]').html(lang["button_save"]);
            $('button[name="delete"]').html(lang["button_delete"]);
            $('button[name="add"]').html(lang["button_add"]);

            //others
            $('div.playlists-list span').html(lang["default_playlist_name"]);
            $('input[name="search"]').attr("placeholder", lang["search"] + "...");
            $('div.songs div.search-fallback').html(lang["search_nothing_found"]);
            $('li.add-playlist div').html(lang["add_playlist"]);
            $('div.playlists-list ul li div[data-key="all"]').html(lang["default_playlist_name"]);

            $('[data-lang]').each(function () {
                $(this).html(lang[$(this).attr("data-lang")]);
            });
        }
    });
}

function findSong(md5) {
    return {
        all: $('div.songs ul.all-songs li[data-md5="' + md5 + '"]'),
        pl: $('div.songs ul.playlisted-songs li[data-md5="' + md5 + '"]')
    };
}

function createUploadProgressBar(text) {
    return $('<div class="upload-progress"><h4>' + text + '</h4><progress value="0" max="100"></progress></div>');
}

function removeTrackLocal(md5) {
    var elem = findSong(md5);

    if (elem.all.length > 0) {
        $(elem.all).remove();
    }

    if (elem.pl.length > 0) {
        $(elem.pl).remove();
    }

    for (var i in playlists) {
        delete playlists[i][md5];
    }
}

function createPlaylistEditSongBox(name, hash, checked) {
    var box = $('<li' + (checked === true ? ' class="active"' : '') + ' data-md5="' + hash + '" title="' + name + '">\n\
            <div class="playlists-control-songname">' + name + '</div><input' + (checked === true ? " checked" : "") + ' type="checkbox" />\n\
            </li>');

    $(box).click(function (e) {
        if ($(this).hasClass("active")) {
            $(this).removeClass("active");
            if (e.target.tagName.toLowerCase() !== "input") {
                $(this).find("input").prop("checked", false);
            }
        } else {
            $(this).addClass("active");
            if (e.target.tagName.toLowerCase() !== "input") {
                $(this).find("input").prop("checked", true);
            }
        }
    });

    return box;
}

function recountTable(table) {
    var i = 0;

    $(table).find('tbody tr').each(function () {
        i++;
        $(this).find("td").first().html(i);
    });
}

function getSongImage(md5) {
    if(lib[md5] == undefined || lib[md5] == null || !lib[md5].has_picture) {
        return "img/default_album.png";
    } else {
        return "timg/"+md5;
    }
}

function playSong(md5) {
    if (lib[md5] == undefined) {
        audyAlert(lang["error_unable_to_load_track"], true);
        return;
    }
    
    if($('div.seekbar').hasClass("pushed")) {
        $('div.seekbar').removeClass("pushed");
    }

    audio.pause();
    $(audio).attr("src", "http://" + location.host + "/track/" + md5);
    activeTrack = md5;
    
    setValue(0);

    $('li[data-role="pause"] img').attr("src", "img/icons/pause.png").removeClass("paused");

    if ($('div.track-album div.track-lyrics:visible').length > 0) {
        $('div.track-album div.track-lyrics').hide();
        $('div.track-album img').show();
    }

    $('div.track-album div.track-lyrics p').html(lib[md5].lyrics === "" ? lang["no_lyrics"] : lib[md5].lyrics);

    let image = getSongImage(md5);
    if (image !== "img/default_album.png") {
        $('div.track-info div.track-album img').animate({
            opacity: 0
        }, 100, function () {
            $(this).attr("src", image).animate({
                opacity: 1
            }, 200);
        });
    } else {
        if ($('div.track-info div.track-album img').attr("src") !== "img/default_album.png") {
            $('div.track-info div.track-album img').animate({
                opacity: 0
            }, 100, function () {
                $(this).attr("src", "img/default_album.png").animate({
                    opacity: 1
                }, 200);
            });
        }
    }
   
    var title = lib[md5].name;
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

    $('li[data-role="song"].active').removeClass("active");
}