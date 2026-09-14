# CS 260 Notes

This file represents what I have learned about web programming.

- [My startup](https://startup.cs260.click)
- [My simon](https://simon.cs260.click)

## Helpful links

- [Course instruction](https://github.com/webprogramming260)
- [Canvas](https://byu.instructure.com)
- [MDN](https://developer.mozilla.org)

## Intro

#### Interesting things I've learned in the intro 
As I've used Github more and more, it's been interesting to see the changes. I learned that if you try to clone the repo using the https address, it attempts to use password verification; only by using the ssh address does it use my actual ssh key to access the repository.

I've also learned that I love web programming. That's news to me; let's make it true.

## AWS

EC2 is in charge of web server instances.
Current public IP address: 54.89.249.18
Right now, due to the server running on the HTTP protocol (not secure HTTP), I have to manually type "http" because firefox (and most modern browsers) default to using HTTPS. I can ssh in and verify that the files are correct.

I also learned where to put the .pem file on my system (in the .ssh folder) and that the file name doesn't have any special relevance beyond being that .pem file's identifying filename.

I need to do another refresher on how to use vim... If I edit the Caddyfile object in the server, I can enable HTTPS by changing the headers/rules to connect to the DNS. Caddy will automatically create a certificate for my website so that secure connections are possible.

Route53 is in charge of the domain name.
Domain name: [paintwall.net](https://paintwall.net/)

## HTML

Interesting things I have learned about HTML

## React

Interesting things I have learned about React
