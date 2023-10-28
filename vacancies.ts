import fs from 'node:fs/promises';

const debug = false;

let calendar = '';

if (debug) {
    calendar = await fs.readFile('./room_status_response.ics', 'utf8');
} else {
    const res = (await fetch("https://cloud.timeedit.net/itu/web/public/ri6Q58Z5Q087ZyQYZnQ6750.ics"));
    calendar = await res.text();
}

const rooms_csv = await fs.readFile('./rooms.csv', 'utf8');
const rooms_csv_lines = rooms_csv.split('\n');
const rooms_csv_header = rooms_csv_lines[0];
const policy_col = rooms_csv_header.split(',').indexOf('Usage Policy');
const room_id_col = rooms_csv_header.split(',').indexOf('Room Id');

const rooms = rooms_csv_lines
    .filter(line => line.split(',')[policy_col] === 'unsure')
    .map(line => line.split(',')[room_id_col])

const events = Array.from(parseAllEvents(calendar))

const intervalBegin = sameDay_kHour(new Date(), 7);
const intervalEnd = sameDay_kHour(nextDay(new Date()), 0);

const hoursInInverval = Array.from(hoursBetween(intervalBegin, intervalEnd));

const room_to_idx = Object.fromEntries(rooms.map((room, idx) => [room, idx]));
const idx_to_room = Object.fromEntries(rooms.map((room, idx) => [idx, room]));
const hours_to_idx = Object.fromEntries(hoursInInverval.map((hour, idx) => [hour.toUTCString(), idx]));
const idx_to_hours = Object.fromEntries(hoursInInverval.map((hour, idx) => [idx, hour]));

const vacancyMatrix = createVacancyMatrix(rooms, hoursInInverval, events);

printVacancyMatrix(hoursInInverval, rooms, vacancyMatrix);


type Event = {
    "start": Date,
    "end": Date,
    "rooms": string[]
}

function* parseAllEvents(str: string) {
    const eventRegex = /^BEGIN:VEVENT$.*?^END:VEVENT$/gms;

    let groupMatch: RegExpExecArray | null;

    while ((groupMatch = eventRegex.exec(str)) !== null) {

        let events: Event[] = [];
        
        for (let match of Array.from(groupMatch)) {
            let eventStart: Date|null = null;
            let eventEnd: Date|null = null;
            let eventRooms: string[] = [];

            let stringBuilder = '';
            for (const line of match.split('\n')) {

                if (line.startsWith('DTSTART')) {
                    eventStart = parseDate(line.trim().replace('DTSTART:', ''));
                }

                if (line.startsWith('DTEND')) {
                    eventEnd = parseDate(line.trim().replace('DTEND:', ''));
                }

                if (line.startsWith('LOCATION')) {
                    stringBuilder += line.trim().replace('LOCATION:', '');

                    while (line.startsWith(' ')) {
                        stringBuilder += line.slice(1);
                    }

                    const roomRegex = /\d[A-Z]\d\d(?:-\d\d)?/gm;

                    let roomMatch: RegExpExecArray | null;
                    const rooms: string[] = [];
                    while ((roomMatch = roomRegex.exec(stringBuilder)) !== null) {
        
                        roomMatch.map((match, groupIndex) => {
                            rooms.push(match);
                        });
                    }

                    
                    eventRooms = rooms;
                    
                    if (eventRooms.length === 0) {
                        console.log('No room ids found for location: ', stringBuilder);
                    }
                    stringBuilder = '';
                }
            }

            if (eventRooms.length === 0) {
                console.log('Skipping...');
                continue;
            }
            if (eventStart === null) {
                console.log('Invalid start date.');
                console.log('Skipping...');
                continue;
            }
            if (eventEnd === null) {
                console.log('Invalid end date.');
                console.log('Skipping...');
                continue;
            }

            const event: Event = {
                "start": eventStart,
                "end": eventEnd,
                "rooms": eventRooms
            };

            events.push(event);
        }

        for (let event of events) {
            yield event;
        }
    }
}

function parseDate(icalDateString: string) {
    const year = icalDateString.substring(0, 4)
    const month = icalDateString.substring(4, 6)
    const day = icalDateString.substring(6, 8)
    const t = icalDateString.substring(8,9)
    const hour = icalDateString.substring(9,11)
    const minute = icalDateString.substring(11,13)
    const second = icalDateString.substring(13,15)
    const z = icalDateString.substring(15,16)
    const date = new Date(`${year}-${month}-${day}${t}${hour}:${minute}:${second}.000${z}`);
    return date;
}

function createVacancyMatrix(rooms: string[], hoursInInverval: Date[], events: Event[]) {
    const vacancyMatrix = Array.from({length: rooms.length}, () => Array.from({length: hoursInInverval.length}, () => true));

    for (let hour of hoursInInverval) {
        for (const event of events) {
            if (event.start <= hour && hour < event.end) {
                for (const room of event.rooms) {
                    vacancyMatrix[room_to_idx[room]][hours_to_idx[hour.toUTCString()]] = false;
                }
            }
        }
    }

    return vacancyMatrix;
}

function printVacancyMatrix(hoursInInverval: Date[], rooms: string[], vacancyMatrix: boolean[][]) {
    const padding = rooms.reduce((acc, room) => Math.max(acc, room.length), 0) + 1;

    let hourStr = 'Hour'.padEnd(padding) + ': ';
    for (let hour of hoursInInverval) {
        hourStr += hour.getHours().toString().padStart(3);
    }
    console.log(hourStr);

    for (let room of rooms) {
        let str = room.padEnd(padding) + ': ';
        for (let hour of hoursInInverval) {

            if (vacancyMatrix[room_to_idx[room]][hours_to_idx[hour.toUTCString()]]) {
                str += '  V';
            } else {
                str += '   ';
            }
        }

        console.log(str);
    }
}

function nextDay(date: Date) {
	const now = date;
	const next = new Date(now);
	next.setDate(now.getDate() + 1);
	return next;
}

function nextHour(date: Date) {
	const now = date;
	const next = new Date(now);
	next.setHours(now.getHours() + 1);
	return next;
}

function sameDay_kHour(date: Date, hour: number) {
	const now = date;
	const next = new Date(now);
	next.setHours(hour);
	next.setMinutes(0);
	next.setSeconds(0);
	next.setMilliseconds(0);
	return next;
}

function floorWholeHour(date: Date) {
	const now = date;
	const next = new Date(now);
	next.setMinutes(0);
	next.setSeconds(0);
	next.setMilliseconds(0);
	return next;
}

function floor30Min(date: Date) {
	const now = date;
	const next = new Date(now);
	next.setMinutes(30);
	next.setSeconds(0);
	next.setMilliseconds(0);
	return next;
}

function getRoomsVacant() {
    const roomsVacant = {}
    for (const room of rooms) {
        roomsVacant[room] = true;
    }
    return roomsVacant;
}

function* hoursBetween(start: Date, end: Date) {
    let hour = start;
    while (hour < end) {
        yield hour;
        hour = nextHour(hour);
    }
}
