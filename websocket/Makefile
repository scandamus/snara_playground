run: stop
	-docker run --rm -d -p 6379:6379 redis:7
	-python mysite/manage.py runserver

stop:
	-docker stop `docker ps -qa`
