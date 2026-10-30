-- El esquema SCOTT/TIGER de Oracle (demobld.sql: emp, dept, salgrade y bonus, vacía), pasado a
-- PostgreSQL. Lo carga crear.sql.
DROP SCHEMA IF EXISTS scott CASCADE;
CREATE SCHEMA scott;
SET search_path = scott;

CREATE TABLE dept (
  deptno integer PRIMARY KEY,
  dname  varchar(14),
  loc    varchar(13)
);

CREATE TABLE emp (
  empno    integer PRIMARY KEY,
  ename    varchar(10),
  job      varchar(9),
  mgr      integer REFERENCES emp,
  hiredate date,
  sal      numeric(7, 2),
  comm     numeric(7, 2),
  deptno   integer REFERENCES dept
);

CREATE TABLE bonus (
  ename varchar(10),
  job   varchar(9),
  sal   numeric,
  comm  numeric
);

CREATE TABLE salgrade (
  grade integer,
  losal numeric,
  hisal numeric
);

INSERT INTO dept VALUES
  (10, 'ACCOUNTING', 'NEW YORK'),
  (20, 'RESEARCH', 'DALLAS'),
  (30, 'SALES', 'CHICAGO'),
  (40, 'OPERATIONS', 'BOSTON');

-- En orden: cada jefe antes que los suyos.
INSERT INTO emp VALUES
  (7839, 'KING', 'PRESIDENT', NULL, '1981-11-17', 5000, NULL, 10),
  (7698, 'BLAKE', 'MANAGER', 7839, '1981-05-01', 2850, NULL, 30),
  (7782, 'CLARK', 'MANAGER', 7839, '1981-06-09', 2450, NULL, 10),
  (7566, 'JONES', 'MANAGER', 7839, '1981-04-02', 2975, NULL, 20),
  (7788, 'SCOTT', 'ANALYST', 7566, '1987-07-13', 3000, NULL, 20),
  (7902, 'FORD', 'ANALYST', 7566, '1981-12-03', 3000, NULL, 20),
  (7369, 'SMITH', 'CLERK', 7902, '1980-12-17', 800, NULL, 20),
  (7499, 'ALLEN', 'SALESMAN', 7698, '1981-02-20', 1600, 300, 30),
  (7521, 'WARD', 'SALESMAN', 7698, '1981-02-22', 1250, 500, 30),
  (7654, 'MARTIN', 'SALESMAN', 7698, '1981-09-28', 1250, 1400, 30),
  (7844, 'TURNER', 'SALESMAN', 7698, '1981-09-08', 1500, 0, 30),
  (7876, 'ADAMS', 'CLERK', 7788, '1987-07-13', 1100, NULL, 20),
  (7900, 'JAMES', 'CLERK', 7698, '1981-12-03', 950, NULL, 30),
  (7934, 'MILLER', 'CLERK', 7782, '1982-01-23', 1300, NULL, 10);

INSERT INTO salgrade VALUES
  (1, 700, 1200),
  (2, 1201, 1400),
  (3, 1401, 2000),
  (4, 2001, 3000),
  (5, 3001, 9999);

RESET search_path;
