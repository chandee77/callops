-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 29, 2026 at 05:24 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `callops`
--

-- --------------------------------------------------------

--
-- Table structure for table `holiday`
--

CREATE TABLE `holiday` (
  `id` int(11) NOT NULL,
  `date` date NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roster`
--

CREATE TABLE `roster` (
  `id` int(11) NOT NULL,
  `date` date NOT NULL,
  `shiftType` varchar(50) NOT NULL,
  `userId` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `unavailability`
--

CREATE TABLE `unavailability` (
  `id` int(11) NOT NULL,
  `userId` varchar(50) NOT NULL,
  `date` date NOT NULL,
  `shiftType` varchar(50) NOT NULL,
  `reason` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `id` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `totalShifts` int(11) NOT NULL DEFAULT 0,
  `lastShiftDate` datetime DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`id`, `name`, `email`, `totalShifts`, `lastShiftDate`, `isActive`) VALUES
('IT01', 'Buddhika', NULL, 0, '0000-00-00 00:00:00', 1),
('IT02', 'Dhajani', NULL, 0, '0000-00-00 00:00:00', 1),
('IT03', 'Niranga', NULL, 0, '0000-00-00 00:00:00', 1),
('IT04', 'Rupika', NULL, 0, '0000-00-00 00:00:00', 1),
('IT05', 'Primani', NULL, 0, '0000-00-00 00:00:00', 1),
('IT06 ', 'Gayan', NULL, 0, '0000-00-00 00:00:00', 1),
('IT07', 'Praneeth', NULL, 0, '0000-00-00 00:00:00', 1),
('IT08', 'Lahiru', NULL, 0, '0000-00-00 00:00:00', 1),
('IT09', 'Charani', NULL, 0, '0000-00-00 00:00:00', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `holiday`
--
ALTER TABLE `holiday`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `date` (`date`);

--
-- Indexes for table `roster`
--
ALTER TABLE `roster`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_shift` (`date`,`shiftType`),
  ADD KEY `userId` (`userId`);

--
-- Indexes for table `unavailability`
--
ALTER TABLE `unavailability`
  ADD PRIMARY KEY (`id`),
  ADD KEY `userId` (`userId`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `holiday`
--
ALTER TABLE `holiday`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roster`
--
ALTER TABLE `roster`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `unavailability`
--
ALTER TABLE `unavailability`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `roster`
--
ALTER TABLE `roster`
  ADD CONSTRAINT `roster_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `user` (`id`);

--
-- Constraints for table `unavailability`
--
ALTER TABLE `unavailability`
  ADD CONSTRAINT `unavailability_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
