// Pre-populated karaoke song catalog
export const defaultSongs = [
    // Pop Classics
    { 
        title: "Bohemian Rhapsody", 
        artist: "Queen", 
        genre: "Rock", 
        difficulty: "Hard",
        lyrics: "Is this the real life? Is this just fantasy?\nCaught in a landslide, no escape from reality\nOpen your eyes, look up to the skies and see\nI'm just a poor boy, I need no sympathy\nBecause I'm easy come, easy go\nLittle high, little low\nAny way the wind blows doesn't really matter to me, to me"
    },
    { 
        title: "Don't Stop Believin'", 
        artist: "Journey", 
        genre: "Rock", 
        difficulty: "Medium",
        lyrics: "Just a small town girl, livin' in a lonely world\nShe took the midnight train goin' anywhere\nJust a city boy, born and raised in South Detroit\nHe took the midnight train goin' anywhere\n\nDon't stop believin'\nHold on to that feelin'\nStreetlight people"
    },
    { 
        title: "Sweet Caroline", 
        artist: "Neil Diamond", 
        genre: "Pop", 
        difficulty: "Easy",
        lyrics: "Where it began, I can't begin to knowin'\nBut then I know it's growin' strong\nWas in the spring, and spring became the summer\nWho'd have believed you'd come along?\n\nHands, touchin' hands\nReachin' out, touchin' me, touchin' you\n\nSweet Caroline\nGood times never seemed so good\nI've been inclined\nTo believe they never would"
    },
    { title: "Livin' on a Prayer", artist: "Bon Jovi", genre: "Rock", difficulty: "Medium" },
    { title: "I Will Survive", artist: "Gloria Gaynor", genre: "Disco", difficulty: "Medium" },
    { title: "Dancing Queen", artist: "ABBA", genre: "Pop", difficulty: "Easy" },
    { title: "Take On Me", artist: "a-ha", genre: "Pop", difficulty: "Hard" },
    { title: "Total Eclipse of the Heart", artist: "Bonnie Tyler", genre: "Pop", difficulty: "Medium" },
    { title: "Sweet Home Alabama", artist: "Lynyrd Skynyrd", genre: "Rock", difficulty: "Easy" },
    { title: "Mr. Brightside", artist: "The Killers", genre: "Rock", difficulty: "Medium" },
    
    // Modern Pop
    { title: "Shape of You", artist: "Ed Sheeran", genre: "Pop", difficulty: "Easy" },
    { title: "Uptown Funk", artist: "Bruno Mars", genre: "Pop", difficulty: "Medium" },
    { title: "Happy", artist: "Pharrell Williams", genre: "Pop", difficulty: "Easy" },
    { title: "Shallow", artist: "Lady Gaga & Bradley Cooper", genre: "Pop", difficulty: "Medium" },
    { title: "Someone Like You", artist: "Adele", genre: "Pop", difficulty: "Medium" },
    { title: "Rolling in the Deep", artist: "Adele", genre: "Pop", difficulty: "Medium" },
    { title: "Thinking Out Loud", artist: "Ed Sheeran", genre: "Pop", difficulty: "Easy" },
    { title: "All of Me", artist: "John Legend", genre: "R&B", difficulty: "Medium" },
    { title: "Stay With Me", artist: "Sam Smith", genre: "Pop", difficulty: "Easy" },
    { title: "Blinding Lights", artist: "The Weeknd", genre: "Pop", difficulty: "Medium" },
    
    // R&B & Soul
    { title: "Respect", artist: "Aretha Franklin", genre: "R&B", difficulty: "Medium" },
    { title: "Ain't No Mountain High Enough", artist: "Marvin Gaye", genre: "R&B", difficulty: "Medium" },
    { title: "I Will Always Love You", artist: "Whitney Houston", genre: "R&B", difficulty: "Hard" },
    { title: "Superstition", artist: "Stevie Wonder", genre: "R&B", difficulty: "Medium" },
    { title: "Crazy in Love", artist: "Beyoncé", genre: "R&B", difficulty: "Medium" },
    { title: "No Diggity", artist: "Blackstreet", genre: "R&B", difficulty: "Medium" },
    { title: "Kiss from a Rose", artist: "Seal", genre: "R&B", difficulty: "Hard" },
    
    // Rock Anthems
    { title: "We Will Rock You", artist: "Queen", genre: "Rock", difficulty: "Easy" },
    { title: "We Are the Champions", artist: "Queen", genre: "Rock", difficulty: "Medium" },
    { title: "Eye of the Tiger", artist: "Survivor", genre: "Rock", difficulty: "Easy" },
    { title: "Pour Some Sugar on Me", artist: "Def Leppard", genre: "Rock", difficulty: "Medium" },
    { title: "You Shook Me All Night Long", artist: "AC/DC", genre: "Rock", difficulty: "Medium" },
    { title: "Paradise City", artist: "Guns N' Roses", genre: "Rock", difficulty: "Hard" },
    { title: "Sweet Child O' Mine", artist: "Guns N' Roses", genre: "Rock", difficulty: "Hard" },
    { title: "Wonderwall", artist: "Oasis", genre: "Rock", difficulty: "Easy" },
    { title: "Creep", artist: "Radiohead", genre: "Rock", difficulty: "Medium" },
    
    // Country
    { title: "Friends in Low Places", artist: "Garth Brooks", genre: "Country", difficulty: "Easy" },
    { title: "Jolene", artist: "Dolly Parton", genre: "Country", difficulty: "Medium" },
    { title: "Take Me Home, Country Roads", artist: "John Denver", genre: "Country", difficulty: "Easy" },
    { title: "Ring of Fire", artist: "Johnny Cash", genre: "Country", difficulty: "Easy" },
    { title: "Before He Cheats", artist: "Carrie Underwood", genre: "Country", difficulty: "Medium" },
    
    // Hip-Hop & Rap
    { title: "Lose Yourself", artist: "Eminem", genre: "Hip-Hop", difficulty: "Hard" },
    { title: "Gold Digger", artist: "Kanye West", genre: "Hip-Hop", difficulty: "Medium" },
    { title: "In Da Club", artist: "50 Cent", genre: "Hip-Hop", difficulty: "Medium" },
    { title: "Hotline Bling", artist: "Drake", genre: "Hip-Hop", difficulty: "Easy" },
    { title: "Old Town Road", artist: "Lil Nas X", genre: "Hip-Hop", difficulty: "Easy" },
    
    // K-Pop
    { title: "Dynamite", artist: "BTS", genre: "K-Pop", difficulty: "Medium" },
    { title: "Butter", artist: "BTS", genre: "K-Pop", difficulty: "Easy" },
    { title: "How You Like That", artist: "BLACKPINK", genre: "K-Pop", difficulty: "Medium" },
    { title: "Gangnam Style", artist: "PSY", genre: "K-Pop", difficulty: "Easy" },
    { title: "Kill This Love", artist: "BLACKPINK", genre: "K-Pop", difficulty: "Medium" },
    { title: "Boy With Luv", artist: "BTS ft. Halsey", genre: "K-Pop", difficulty: "Medium" },
    { title: "DDU-DU DDU-DU", artist: "BLACKPINK", genre: "K-Pop", difficulty: "Medium" },
    { title: "Lovesick Girls", artist: "BLACKPINK", genre: "K-Pop", difficulty: "Medium" },
    
    // J-Pop & Anime
    { title: "Cruel Angel's Thesis", artist: "Yoko Takahashi", genre: "J-Pop", difficulty: "Hard" },
    { title: "Unravel", artist: "TK from Ling Tosite Sigure", genre: "J-Pop", difficulty: "Hard" },
    { title: "Gurenge", artist: "LiSA", genre: "J-Pop", difficulty: "Hard" },
    { title: "Sparkle", artist: "RADWIMPS", genre: "J-Pop", difficulty: "Medium" },
    { title: "Lemon", artist: "Kenshi Yonezu", genre: "J-Pop", difficulty: "Medium" },
    
    // Disney & Musicals
    { title: "Let It Go", artist: "Idina Menzel", genre: "Disney", difficulty: "Medium" },
    { title: "A Whole New World", artist: "Aladdin", genre: "Disney", difficulty: "Medium" },
    { title: "Under the Sea", artist: "The Little Mermaid", genre: "Disney", difficulty: "Easy" },
    { title: "Circle of Life", artist: "The Lion King", genre: "Disney", difficulty: "Medium" },
    { title: "Part of Your World", artist: "The Little Mermaid", genre: "Disney", difficulty: "Medium" },
    { title: "Beauty and the Beast", artist: "Beauty and the Beast", genre: "Disney", difficulty: "Easy" },
    { title: "Can You Feel the Love Tonight", artist: "The Lion King", genre: "Disney", difficulty: "Easy" },
    { title: "How Far I'll Go", artist: "Moana", genre: "Disney", difficulty: "Medium" },
    { title: "Into the Unknown", artist: "Frozen 2", genre: "Disney", difficulty: "Hard" },
    { title: "We Don't Talk About Bruno", artist: "Encanto", genre: "Disney", difficulty: "Medium" },
    
    // 80s Hits
    { title: "Billie Jean", artist: "Michael Jackson", genre: "Pop", difficulty: "Medium" },
    { title: "Beat It", artist: "Michael Jackson", genre: "Pop", difficulty: "Medium" },
    { title: "Thriller", artist: "Michael Jackson", genre: "Pop", difficulty: "Medium" },
    { title: "Like a Prayer", artist: "Madonna", genre: "Pop", difficulty: "Medium" },
    { title: "Material Girl", artist: "Madonna", genre: "Pop", difficulty: "Easy" },
    { title: "Girls Just Want to Have Fun", artist: "Cyndi Lauper", genre: "Pop", difficulty: "Easy" },
    { title: "I Love Rock 'n' Roll", artist: "Joan Jett", genre: "Rock", difficulty: "Easy" },
    { title: "Africa", artist: "Toto", genre: "Pop", difficulty: "Medium" },
    { title: "Every Breath You Take", artist: "The Police", genre: "Pop", difficulty: "Easy" },
    
    // 90s Hits
    { title: "Wannabe", artist: "Spice Girls", genre: "Pop", difficulty: "Easy" },
    { title: "...Baby One More Time", artist: "Britney Spears", genre: "Pop", difficulty: "Easy" },
    { title: "I Want It That Way", artist: "Backstreet Boys", genre: "Pop", difficulty: "Easy" },
    { title: "Bye Bye Bye", artist: "NSYNC", genre: "Pop", difficulty: "Easy" },
    { title: "Smells Like Teen Spirit", artist: "Nirvana", genre: "Rock", difficulty: "Medium" },
    { title: "Iris", artist: "Goo Goo Dolls", genre: "Rock", difficulty: "Medium" },
    { title: "My Heart Will Go On", artist: "Celine Dion", genre: "Pop", difficulty: "Hard" },
    { title: "No Scrubs", artist: "TLC", genre: "R&B", difficulty: "Medium" },
    { title: "Waterfalls", artist: "TLC", genre: "R&B", difficulty: "Medium" },
    
    // 2000s Hits
    { title: "Since U Been Gone", artist: "Kelly Clarkson", genre: "Pop", difficulty: "Medium" },
    { title: "Toxic", artist: "Britney Spears", genre: "Pop", difficulty: "Medium" },
    { title: "Crazy", artist: "Gnarls Barkley", genre: "Pop", difficulty: "Medium" },
    { title: "Hey Ya!", artist: "OutKast", genre: "Hip-Hop", difficulty: "Easy" },
    { title: "Mr. Brightside", artist: "The Killers", genre: "Rock", difficulty: "Medium" },
    { title: "Umbrella", artist: "Rihanna", genre: "Pop", difficulty: "Easy" },
    { title: "Single Ladies", artist: "Beyoncé", genre: "Pop", difficulty: "Medium" },
    { title: "Poker Face", artist: "Lady Gaga", genre: "Pop", difficulty: "Medium" },
    { title: "Bad Romance", artist: "Lady Gaga", genre: "Pop", difficulty: "Medium" },
    
    // 2010s-2020s Hits
    { title: "Call Me Maybe", artist: "Carly Rae Jepsen", genre: "Pop", difficulty: "Easy" },
    { title: "Royals", artist: "Lorde", genre: "Pop", difficulty: "Easy" },
    { title: "Shake It Off", artist: "Taylor Swift", genre: "Pop", difficulty: "Easy" },
    { title: "Blank Space", artist: "Taylor Swift", genre: "Pop", difficulty: "Easy" },
    { title: "Love Story", artist: "Taylor Swift", genre: "Pop", difficulty: "Easy" },
    { title: "Anti-Hero", artist: "Taylor Swift", genre: "Pop", difficulty: "Easy" },
    { title: "Levitating", artist: "Dua Lipa", genre: "Pop", difficulty: "Medium" },
    { title: "Don't Start Now", artist: "Dua Lipa", genre: "Pop", difficulty: "Medium" },
    { title: "drivers license", artist: "Olivia Rodrigo", genre: "Pop", difficulty: "Medium" },
    { title: "good 4 u", artist: "Olivia Rodrigo", genre: "Pop", difficulty: "Medium" },
    { title: "Peaches", artist: "Justin Bieber", genre: "Pop", difficulty: "Easy" },
    { title: "Watermelon Sugar", artist: "Harry Styles", genre: "Pop", difficulty: "Easy" },
    { title: "As It Was", artist: "Harry Styles", genre: "Pop", difficulty: "Easy" },
    { title: "Flowers", artist: "Miley Cyrus", genre: "Pop", difficulty: "Easy" },
    
    // Duets
    { title: "Endless Love", artist: "Diana Ross & Lionel Richie", genre: "R&B", difficulty: "Medium" },
    { title: "Don't Go Breaking My Heart", artist: "Elton John & Kiki Dee", genre: "Pop", difficulty: "Easy" },
    { title: "Summer Nights", artist: "Grease", genre: "Musical", difficulty: "Easy" },
    { title: "You're the One That I Want", artist: "Grease", genre: "Musical", difficulty: "Easy" },
    { title: "Islands in the Stream", artist: "Kenny Rogers & Dolly Parton", genre: "Country", difficulty: "Easy" },
    { title: "Shallow", artist: "Lady Gaga & Bradley Cooper", genre: "Pop", difficulty: "Medium" },
];

// Encouraging messages after performance
export const performanceMessages = [
    "🎤 Practice makes perfect!",
    "🌟 Great effort! Keep singing!",
    "👏 That was amazing! Encore!",
    "🎵 Beautiful performance!",
    "✨ You're a star!",
    "🎶 Wonderful singing!",
    "💫 Keep up the great work!",
    "🎤 Bravo! Well done!",
    "🌈 That was fantastic!",
    "🎵 Music to our ears!",
];

// Get a random performance message
export function getPerformanceMessage() {
    return performanceMessages[Math.floor(Math.random() * performanceMessages.length)];
}
