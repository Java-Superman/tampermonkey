// ==UserScript==
// @name         Albion killboard
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Alters player, guild, and battle killboard with additional information
// @author       You
// @match        https://albiononline.com/*/killboard
// @match        https://albiononline.com/*/killboard/*
// @run-at document-start
// @require       https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @updateURL   https://raw.githubusercontent.com/Java-Superman/tampermonkey/master/Albion killboard.user.js
// @downloadURL   https://raw.githubusercontent.com/Java-Superman/tampermonkey/master/Albion killboard.user.js
// @grant        GM_addStyle
// ==/UserScript==

(function($) {
    'use strict';

    GM_addStyle(".mouseHilite:hover { filter:brightness(150%)}");

    var deathsReactId = ".0.2.1.1.0.0.1.0.0.2";
    var pvpReactId = ".0.2.1.1.0.0.0.0.1.0.0.0.0.3";
    var tkReactId = ".0.2.1.1.0.0.0.2.0.2";
    var skReactId = ".0.2.1.1.0.0.0.4.0.2";
    var responses = { deaths: null, player: null, topKills: null, soloKills: null, guild: null, battles: null, players: null };

    function requestDone(xhr,evt) {
        if( xhr.responseText ) {
            var response = { data: JSON.parse( xhr.responseText ), url: xhr.responseURL };
            if( response.url.match( /api\/gameinfo\/players\/[^\/]{22}\/deaths$/ ) ) {
                responses.deaths = response;
                console.log(xhr.readyState, response );

                var $table = $( "table[data-reactid='" + deathsReactId + "']" );
                $table.find( "[data-reactid='" + deathsReactId + ".$thead.1.$0']" ).each( function() {
                    var $n = $(this);
                    $n.before( "<th>Date</th>" );
                    $n.after( "<th>Btl</th>" );
                } );

                $table.find( "[data-reactid^='" + deathsReactId + ".$tbody'][data-reactid$='.$Killer']" ).each( function() {
                    var $n = $(this);
                    var index = parseInt( $n.attr('data-reactid').match( /tbody\.\$(\d+)/ )[1] );
                    var data = responses.deaths.data[index];
                    var ts = new Date( Date.parse( data.TimeStamp ) );
                    $n.before( "<td>" + ( ts.getMonth() + 1 ) + "/" + ts.getDate() + "</td>" );
                    $n.after( "<td>" + createBattle( data, true ) + "</td>" );
                });

                $table.find( "td[data-reactid$='Fame'] span").each(function(e) {
                    var $n = $(this);
                    var index = $n.attr('data-reactid').match( /(\d+)\.\$Fame\.0$/ );
                    var death;
                    if( index != null ) {
                        index = parseInt( index[1] );
                        death = responses.deaths.data[ index ];
                        if( death ) {
                            $n.html("<a href='" + toUrl( "killboard/kill/" + death.EventId ) + "'>" + $n.html() + "</a>" );
                        }
                    }
                });

            } else if( response.url.match( /api\/gameinfo\/players\/statistics/ ) ) {
                console.log(xhr.readyState, response );
                // ignore
            } else if( response.url.match( /api\/gameinfo\/players\/[^\/]{22}$/ ) ) {
                responses.player = response;
                console.log(xhr.readyState, response );
                var $pvpDiv = $(document).find( "[data-reactid='" + pvpReactId + "']" );
                $pvpDiv.each( function() {
                    var $n = $(this);
                    var pve = responses.player.data.LifetimeStatistics.PvE;
                    $n.before( "<div style='float:right'><div class='mini-profile__key'>PvE Fame</div><div class='mini-profile__value'>" + pve.Total.toLocaleString() + "</div></div>" );

                    $n.after( "<div style='float:right'><div class='mini-profile__key'>PvP Ratio</div><div class='mini-profile__value'>" + (responses.player.data.FameRatio).toLocaleString() + "</div></div>" );
                });

                $pvpDiv.find( "[data-reactid='" + pvpReactId + ".1']" ).each( function() {
                    var $n = $(this);
                    var txt = $n.text();
                    $n.text( txt + " / " + responses.player.data.DeathFame.toLocaleString() );
                });
            } else if( response.url.match( /api\/gameinfo\/players\/[^\/]+\/topkills/ ) ) {
                responses.topKills = response;
                console.log(xhr.readyState, response );
                adjustKillBoard( "soloKills", tkReactId, response );
            } else if( response.url.match( /api\/gameinfo\/players\/[^\/]+\/solokills/ ) ) {
                responses.soloKills = response;
                console.log(xhr.readyState, response );
                adjustKillBoard( "soloKills", skReactId, response );
            } else if( response.url.match( /api\/gameinfo\/guilds\/[^\/]{22}$/ ) ) {
                responses.guild = response
                console.log(xhr.readyState, response );

                var $guildPvpDiv = $(document).find( "[data-reactid='.0.2.1.1.0.0.0.1.0.0.0.0']" );
                $guildPvpDiv.each( function() {
                    var $n = $(this);
                    var pvp = responses.guild.data;
                    pvp.killFame = ( pvp.killFame ? pvp.killFame : 0 );
                    var kd = pvp.DeathFame > 0 ? pvp.killFame / pvp.DeathFame : "";

                    $n.before( "<div style='float:right'><div><b>PVP Fame</b></div><table class='table table--top-table'>" + createLabel( "Kill", pvp.killFame ) + createLabel( "Death", pvp.DeathFame ) + createLabel( "K/D", kd ) + "</table></div>");
                });
            } else if( response.url.match( /api\/gameinfo\/battles\/.*$/ ) ) {
                console.log("battles", response );
                responses.battles = response
            } else if( response.url.match( /api\/gameinfo\/events\/battle\/.*$/ ) ) {
                console.log("events/battle", response );
                if( response.url.match( /api\/gameinfo\/events\/battle\/.*\?offset=0.*$/ ) ) {
                    responses.players = {}
                }
                var players = responses.players
                function getPlayer(p) {
                    var player = players[p.Id]
                    if( ! player ) {
                        var bp = responses.battles ? responses.battles.data.players[p.Id] : null
                        player = players[p.Id] =
                        {
                            Id: p.Id,
                            Name: p.Name,
                            ParticipatedIn:
                            {
                                Count: 0,
                                DamageDone: 0,
                                SupportHealingDone: 0,
                                Total: {
                                    DamageDone: 0,
                                    SupportHealingDone: 0,
                                    Count: 0
                                }
                            },
                            Kills: 0,
                            Deaths: 0,
                            DeathEventId: 0,
                            Equipment: p.Equipment,
                            GuildName: p.GuildName,
                            GuildId: p.GuildId,
                            AllianceName: p.AllianceName,
                            AllianceId: p.AllianceId,
                            KillFame: bp ? bp.killFame : null
                        }
                    }
                    return player
                }

                response.data.forEach( function(btlEvent) {
                    btlEvent.Total = { DamageDone: 0, SupportHealingDone: 0, Count: 0 }

                    var victim = getPlayer( btlEvent.Victim )
                    victim.Deaths++
                    victim.DeathEventId = btlEvent.EventId

                    var killer = getPlayer( btlEvent.Killer )
                    var evtParticipants = [ killer ]
                    killer.Kills++
                    killer.ParticipatedIn.Count += 1
                    btlEvent.Total.Count++

                    // damage/heal for this player
                    btlEvent.Participants.forEach( function( p ) {
                        var player = getPlayer( p )
                        if( player.Id !== killer.Id ) {
                            player.ParticipatedIn.Count += 1
                            btlEvent.Total.Count++
                            evtParticipants.push( player )
                        }
                        player.ParticipatedIn.DamageDone += p.DamageDone
                        player.ParticipatedIn.SupportHealingDone += p.SupportHealingDone

                        btlEvent.Total.DamageDone += p.DamageDone
                        btlEvent.Total.SupportHealingDone += p.SupportHealingDone
                    } )

                    // Add btlEvent damage/heal for all contributing players
                    evtParticipants.forEach( function( player ) {
                        player.ParticipatedIn.Total.DamageDone += btlEvent.Total.DamageDone
                        player.ParticipatedIn.Total.SupportHealingDone += btlEvent.Total.SupportHealingDone
                        player.ParticipatedIn.Total.Count += btlEvent.Total.Count
                    } )

                } )
                $(document).find("#participantStats").remove()
                var $playersDiv = $(document).find( "[data-reactid='.0.2.1.3.0.0.5']" );
                var notes = response.data.length > 50 ? '<span style="float:right"><small>Click load above for more results</small></span>' : ''
                var playerHtml = '<div class="row" id="participantStats"><div class="small-12 columns"><div class="top-table__headline top-table__headline--sub">All Kill Participants - Stats from <span style="color:red">Battle History</span> Only' + notes + '</div><table class="table table--top-table">'
                + '<thead><tr class="reactable-column-header">'
                + '<th></th>'
                + '<th>WPN</th>'
                + '<th>Player</th>'
                + '<th style="text-align:center">Kill Fame</th>'
                + '<th style="text-align:center">Participated</th>'
                + '<th style="text-align:center">Participants</th>'
                + '<th style="text-align:right">Player Dmg</th>'
                + '<th style="text-align:right">% of Kill</th>'
                + '<th style="text-align:right">Player Heal</th>'
                + '<th style="text-align:right">% of Heal</th>'
                + '<th style="text-align:right">Kills</th>'
                + '</tr></thead><tboady class="reactable-data">'

                function compare(a,b) {
                    if( a === b ) return 0;
                    if( ! a ) return -1
                    if( !b ) return 1
                    return a.toLowerCase().localeCompare(b.toLowerCase())
                }

                console.log( Object.keys( players ).length, players )
                Object.values(players).sort(function (a, b) {
                    var i = compare( a.AllianceName, b.AllianceName )
                    if( i !== 0 ) return i
                    i = compare( b.GuildName, b.GuildName )
                    if( i !== 0 ) return i
                    return compare( a.Name, b.Name );
                }).forEach( function(player) {
                    if( player.ParticipatedIn.Count !== 0 || player.Kills !== 0 ) {
                        playerHtml += '<tr class="fixed-row-height">'
                        + '<td>' + ( player.Deaths > 0 ? '<a class="mouseHilite" href="' + toUrl( "killboard/kill/" + player.DeathEventId ) + '"><img src="https://assets.albiononline.com/assets/images/killboard/kill__date.png" width="30px" height="30px"></img></a>' : '' )
                        + '</td><td>' + createWeaponImg( player.Equipment, 45 )
                        + '</td><td>' + "<a href='" + toUrl( "killboard/player/" + player.Id ) + "'><strong>" + player.Name + "</strong></a>"
                        + '<br/>' + ( player.AllianceId ? "[<a href='" + toUrl( "killboard/alliance/" + player.AllianceId ) + "'>" + player.AllianceName + "</a>] " : '' )
                        + "<a href='" + toUrl( "killboard/guild/" + player.GuildId ) + "'>" + player.GuildName + "</a>"
                        + '</td><td style="text-align:right">' + ( player.KillFame ? player.KillFame.toLocaleString() : '' )
                        + '</td><td style="text-align:center">' + player.ParticipatedIn.Count
                        + '</td><td style="text-align:center">' + player.ParticipatedIn.Total.Count
                        + '</td><td style="text-align:right">' + ( player.ParticipatedIn.DamageDone === 0 ? '' : Math.round( player.ParticipatedIn.DamageDone ).toLocaleString() )
                        + '</td><td style="text-align:right">' + ( player.ParticipatedIn.DamageDone === 0 ? '' : ( player.ParticipatedIn.DamageDone / player.ParticipatedIn.Total.DamageDone * 100.0 ).toFixed(1) + ' %' )
                        + '</td><td style="text-align:right">' + ( player.ParticipatedIn.SupportHealingDone === 0 ? '' : Math.round( player.ParticipatedIn.SupportHealingDone ).toLocaleString() )
                        + '</td><td style="text-align:right">' + ( player.ParticipatedIn.SupportHealingDone === 0 ? '' : ( player.ParticipatedIn.SupportHealingDone / player.ParticipatedIn.Total.SupportHealingDone * 100 ).toFixed(1) + '%' )
                        + '</td><td style="text-align:right">' + player.Kills
                        + '</td></tr>'
                    }
                } )

                playerHtml += '</tbody></table></div></div><br></br>'

                $playersDiv.before( playerHtml )

            } else {
                console.log(xhr.readyState, response );
            }
        }
    }

    function createLabel( label, value ) {
        return "<tr><td><div class='mini-profile__key'>" + label + "</div></td><td><div class='mini-profile__value'>" + value.toLocaleString() + "</div></td>"
    }

    function adjustKillBoard(type,reactId,response) {
        responses[type] = response;
        var $table = $( "table[data-reactid='" + reactId + "']" );

        $table.find( "[data-reactid='" + reactId + ".$thead.1.$1']" ).each( function() {
            var $n = $(this);
            $n.before( "<th>Wpn</th>" );
            $n.after( "<th>Btl</th>" );
        } );

        $table.find( "[data-reactid^='" + reactId + ".$tbody'][data-reactid$='.$Victim']" ).each( function() {
            var $n = $(this);
            var index = parseInt( $n.attr('data-reactid').match( /tbody\.\$(\d+)/ )[1] );
            var data = responses[type].data[index];
            $n.before( '<td>' + createWeaponImg( data.Killer.Equipment, 30 ) + '</td>' );
            $n.after( "<td>" + createBattle( data ) + "</td>" );
        });
    }

    function createWeaponImg(equipment,size) {
        var img = "";
        if( equipment && equipment.MainHand ) {
            var mh = equipment.MainHand;
            img = '<img src="https://gameinfo.albiononline.com/api/gameinfo/items/' + mh.Type + '.png?count=' + mh.Count + '&quality=' + mh.Quality + '" width="' + size + 'px" height="' + size + 'px"/>';
        }
        return img;
    }

    function createBattle(data,useGvGIcon) {
        var btl = ( data.numberOfParticipants ) + "/" + data.groupMemberCount;
        if( data.BattleId && data.EventId && data.BattleId != data.EventId ) {
            btl = '<a href="' + toUrl( 'killboard/battles/' + data.BattleId ) + '"  title="Participants / Group Members">' + btl + '</a>';
        } else if( data.GvGMatch ) {
            if( useGvGIcon ) {
                btl = '<a href="' + toUrl( 'killboard/gvg/' + data.GvGMatch.MatchId ) + '"  title="' + btl + '"><span class="kill__tag kill__tag--gvg"></span></a>';
            } else {
                btl = '<a href="' + toUrl( 'killboard/gvg/' + data.GvGMatch.MatchId ) + '"  title="Participants / Group Members">' + btl + '</a>';
            }

        }
        return btl;
    }

    function toUrl(str) {
        return window.location.href.match( /https:\/\/[^\/]+\/[^\/]+\// )[0] + str;
    }

    (function(open) {
        XMLHttpRequest.prototype.open = function() {
            this.addEventListener("readystatechange", function() {
                if( this.readyState == 4 && this.status == 200 ) {
                    if( this.responseURL.match( /\api\/gameinfo/ ) ) {
                        requestDone(this,arguments[0]);
                    }
                }
            }, false);
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

})( window.jQuery.noConflict(true) );
