var lang = {};

$.ajax({
    url: "/getjson/lang",
    type: "POST",
    async: false,
    success: function (data) {
        lang = JSON.parse(data);

        document.title = lang["login_title"];
        $('input[name="login"]').attr("placeholder", lang["login"]);
        $('input[name="password"]').attr("placeholder", lang["password"]);
        $('button').html(lang["button_login"]);
        $('div.welcome a').html(lang["welcome"]).fadeIn(1000);
        $('div.main div.form').animate({
            opacity: 1,
            bottom: 0
        }, 400);
    }
});

$('button').click(function (e) {
    var form = document.querySelector("form");

    if (form.checkValidity()) {
        e.preventDefault();
        $.ajax({
            url: "/login",
            type: "POST",
            data: {
                login: $('input[name="login"]').val(),
                password: $('input[name="password"]').val()
            },
            success: function (data) {
                if (data.indexOf("error_") >= 0) {
                    audyAlert(lang[data]);
                } else {
                    location.href = '/';
                }
            }
        });
    }
});