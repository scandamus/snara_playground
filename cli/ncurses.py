import curses


def main(stdscr):
    stdscr = curses.initscr()
    stdscr.clear()

    y = 1
    while True:
        stdscr.addstr(0, 0, "pong ")
        c = stdscr.getkey()
        if c == 'q':
            break
        elif c == 's' and 0 < y+1 < 10:
            y += 1
        elif c == 'w' and 0 < y-1 < 10:
            y -= 1
        stdscr.clear()
        stdscr.addstr(y, 1, "|")
        stdscr.refresh()

if __name__ == '__main__':
    curses.wrapper(main)
